import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The SessionStart hook is the first thing an agent reads about the wiki, and
 * what it prints is a command the agent will try to run. Reimplementing its
 * formatter in the test proved nothing about the shipped file, so these cases
 * spawn the hook itself.
 */
const HOOK = join(import.meta.dir, "../../plugins/ymir/hooks/wiki-sync-status.mjs");

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "sync-hook-")); });

/** Stand in for the wiki CLI, answering `status --json` with a stale page. */
function fakeCli(path: string, report: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(report)}\nJSON\n`);
  chmodSync(path, 0o755);
}

const stale = {
  sources: [{ title: "Auth Module", source_path: "src/auth.ts", state: "stale" }],
};

function runHook(skillRoot: string) {
  const r = spawnSync("node", [HOOK], {
    cwd: proj,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: skillRoot },
  });
  return { stdout: r.stdout ?? "", status: r.status };
}

describe("wiki-sync-status hook", () => {
  it("reports stale pages with their tracked file", () => {
    const skillRoot = join(proj, "skill");
    mkdirSync(join(proj, "wiki"), { recursive: true });
    fakeCli(join(skillRoot, "wiki-cli/bin/wiki"), stale);

    const { stdout } = runHook(skillRoot);

    expect(stdout).toContain("[ymir] Wiki out of date");
    expect(stdout).toContain('page "Auth Module"');
    expect(stdout).toContain("src/auth.ts (changed)");
  });

  it("names a command the reader can actually run — the repo-local shim", () => {
    const skillRoot = join(proj, "skill");
    fakeCli(join(proj, "wiki/bin/wiki"), stale);
    fakeCli(join(skillRoot, "wiki-cli/bin/wiki"), stale);

    const { stdout } = runHook(skillRoot);

    expect(stdout).toContain("./wiki/bin/wiki --root ./wiki ingest --source <path>");
  });

  it("falls back to the binary it just ran when the wiki predates the shim", () => {
    const skillRoot = join(proj, "skill");
    mkdirSync(join(proj, "wiki"), { recursive: true });
    const bin = join(skillRoot, "wiki-cli/bin/wiki");
    fakeCli(bin, stale);

    const { stdout } = runHook(skillRoot);

    expect(stdout).toContain(`${bin} --root ./wiki ingest --source <path>`);
  });

  it("reports a missing page as (missing)", () => {
    const skillRoot = join(proj, "skill");
    mkdirSync(join(proj, "wiki"), { recursive: true });
    fakeCli(join(skillRoot, "wiki-cli/bin/wiki"), {
      sources: [{ title: "Readme", source_path: "README.md", state: "missing" }],
    });

    expect(runHook(skillRoot).stdout).toContain("README.md (missing)");
  });

  it("says nothing when every page is in sync", () => {
    const skillRoot = join(proj, "skill");
    mkdirSync(join(proj, "wiki"), { recursive: true });
    fakeCli(join(skillRoot, "wiki-cli/bin/wiki"), {
      sources: [{ title: "Readme", source_path: "README.md", state: "fresh" }],
    });

    const { stdout, status } = runHook(skillRoot);

    expect(stdout).toBe("");
    expect(status).toBe(0);
  });

  it("runs the repo-local shim when the skill root holds no binary — the mixed-install case", () => {
    mkdirSync(join(proj, "wiki"), { recursive: true });
    fakeCli(join(proj, "wiki/bin/wiki"), stale);

    const { stdout } = runHook(join(proj, "skill"));

    expect(stdout).toContain('page "Auth Module"');
  });

  it("stays silent, and never fails the session, when there is no wiki", () => {
    const { stdout, status } = runHook(join(proj, "skill"));

    expect(stdout).toBe("");
    expect(status).toBe(0);
  });
});
