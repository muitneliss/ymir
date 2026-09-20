import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WIKI_SHIM } from "../src/templates/embedded.js";

/**
 * The shim is the only thing `wiki/SCHEMA.md` names, and SCHEMA.md is committed.
 * So these cases are about one property: whatever layout the Ymir CLI happens to
 * be installed under on *this* machine, the tracked invocation has to reach it.
 */

let proj: string;
let home: string;
let pathDir: string;

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "shim-proj-"));
  home = mkdtempSync(join(tmpdir(), "shim-home-"));
  pathDir = mkdtempSync(join(tmpdir(), "shim-path-"));
});

/** Install the shim where `init` puts it: <wiki root>/bin/wiki. */
function installShim(root = "wiki"): string {
  const dir = join(proj, root, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "wiki");
  writeFileSync(path, WIKI_SHIM);
  chmodSync(path, 0o755);
  return path;
}

/** A stand-in for the real binary: echoes how it was called. */
function fakeBin(path: string, body = 'printf "CALLED %s ARGS %s\\n" "$0" "$*"'): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function runShim(
  shim: string,
  args: string[] = ["--root", "./wiki", "index"],
  env: Record<string, string> = {},
  input = "",
) {
  const r = spawnSync("sh", [shim, ...args], {
    cwd: proj,
    input,
    encoding: "utf8",
    env: { HOME: home, PATH: `${pathDir}:/usr/bin:/bin`, ...env },
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

describe("wiki shim resolution order", () => {
  it("prefers YMIR_WIKI_BIN over every discovered layout", () => {
    const shim = installShim();
    fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"));
    const override = fakeBin(join(proj, "custom/wiki"));

    const { stdout, status } = runShim(shim, ["--root", "./wiki", "index"], { YMIR_WIKI_BIN: override });

    expect(status).toBe(0);
    expect(stdout).toContain(override);
    expect(stdout).toContain("ARGS --root ./wiki index");
  });

  it("finds the binary under CLAUDE_PLUGIN_ROOT", () => {
    const shim = installShim();
    const pluginRoot = join(proj, "plugins/ymir");
    const bin = fakeBin(join(pluginRoot, "wiki-cli/bin/wiki"));

    const { stdout, status } = runShim(shim, ["help"], { CLAUDE_PLUGIN_ROOT: pluginRoot });

    expect(status).toBe(0);
    expect(stdout).toContain(bin);
  });

  it("finds a project-local skill install", () => {
    const shim = installShim();
    const bin = fakeBin(join(proj, ".claude/skills/ymir/wiki-cli/bin/wiki"));

    const { stdout, status } = runShim(shim);

    expect(status).toBe(0);
    expect(stdout).toContain(bin);
  });

  it("finds a global skill install under HOME", () => {
    const shim = installShim();
    const bin = fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"));

    const { stdout, status } = runShim(shim);

    expect(status).toBe(0);
    expect(stdout).toContain(bin);
  });

  it("finds an older plugin-cache install — the layout that broke issue #71", () => {
    const shim = installShim();
    const bin = fakeBin(join(home, ".claude/plugins/cache/ymir/ymir/0.5.1/wiki-cli/bin/wiki"));

    const { stdout, status } = runShim(shim);

    expect(status).toBe(0);
    expect(stdout).toContain(bin);
  });

  it("picks the newest plugin-cache version, comparing numerically not lexically", () => {
    const shim = installShim();
    fakeBin(join(home, ".claude/plugins/cache/ymir/ymir/0.9.0/wiki-cli/bin/wiki"));
    const newest = fakeBin(join(home, ".claude/plugins/cache/ymir/ymir/0.10.0/wiki-cli/bin/wiki"));

    const { stdout, status } = runShim(shim);

    expect(status).toBe(0);
    expect(stdout).toContain(newest);
  });

  it("falls back to a wiki on PATH", () => {
    const shim = installShim();
    const bin = fakeBin(join(pathDir, "wiki"));

    const { stdout, status } = runShim(shim);

    expect(status).toBe(0);
    expect(stdout).toContain(bin);
  });

  it("never re-executes itself when the shim is the wiki on PATH", () => {
    const shim = installShim();
    const linked = join(pathDir, "wiki");
    writeFileSync(linked, WIKI_SHIM);
    chmodSync(linked, 0o755);

    const { status, stderr } = runShim(shim);

    expect(status).toBe(127);
    expect(stderr).toContain("not installed");
  });

  it("works for a wiki root other than ./wiki", () => {
    const shim = installShim("docs/wiki");
    const bin = fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"));

    const r = spawnSync("sh", [shim, "--root", "./docs/wiki", "index"], {
      cwd: proj,
      encoding: "utf8",
      env: { HOME: home, PATH: `${pathDir}:/usr/bin:/bin` },
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain(bin);
  });
});

describe("wiki shim hand-off", () => {
  it("forwards stdin, which every ingest depends on", () => {
    const shim = installShim();
    fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"), "cat");

    const { stdout } = runShim(shim, ["ingest"], {}, "page body from stdin");

    expect(stdout).toBe("page body from stdin");
  });

  it("propagates the real binary's exit code", () => {
    const shim = installShim();
    fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"), "exit 3");

    expect(runShim(shim).status).toBe(3);
  });

  it("preserves arguments containing spaces", () => {
    const shim = installShim();
    fakeBin(join(home, ".claude/skills/ymir/wiki-cli/bin/wiki"), 'for a in "$@"; do printf "[%s]" "$a"; done');

    const { stdout } = runShim(shim, ["note", "--name", "Two Words"]);

    expect(stdout).toBe("[note][--name][Two Words]");
  });
});

describe("wiki shim when nothing is installed", () => {
  it("exits 127 and names every location it searched", () => {
    const shim = installShim();

    const { status, stderr } = runShim(shim);

    expect(status).toBe(127);
    expect(stderr).toContain(".claude/skills/ymir/wiki-cli/bin/wiki");
    expect(stderr).toContain(".claude/plugins/cache/ymir/ymir");
  });

  it("names the install command and the override, so the reader can act", () => {
    const shim = installShim();

    const { stderr } = runShim(shim);

    expect(stderr).toContain("npx skills@latest add muitneliss/ymir");
    expect(stderr).toContain("YMIR_WIKI_BIN");
  });

  it("ignores a candidate that exists but is not executable", () => {
    const shim = installShim();
    const path = join(home, ".claude/skills/ymir/wiki-cli/bin/wiki");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "#!/bin/sh\necho hi\n");
    chmodSync(path, 0o644);

    expect(runShim(shim).status).toBe(127);
  });
});
