import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The CLI ships as a `bun build --compile` executable, and only there does
// `process.argv[0]` degrade to the bare string "bun". Running `init` through
// the interpreter cannot observe that, so this exercises the compiled binary.
const CLI = join(import.meta.dir, "..", "src", "cli.ts");
let binary: string;

beforeAll(() => {
  binary = join(mkdtempSync(join(tmpdir(), "init-compiled-bin-")), "wiki");
  const build = spawnSync(
    "bun",
    ["build", CLI, "--compile", "--outfile", binary],
    { encoding: "utf8" },
  );
  if (build.status !== 0) throw new Error(`compile failed: ${build.stderr}`);
});

describe("wiki init from the compiled binary", () => {
  test("documents the repo-local shim, never the scaffolding machine's path", () => {
    const project = mkdtempSync(join(tmpdir(), "init-compiled-proj-"));
    const run = spawnSync(binary, ["--root", "./wiki", "init"], {
      cwd: project,
      encoding: "utf8",
    });

    // Regression: this exited 1 with "ENOENT: lstat 'bun'" (#64, #65).
    expect(run.status).toBe(0);

    const schema = readFileSync(join(project, "wiki", "SCHEMA.md"), "utf8");
    expect(schema).toContain("./wiki/bin/wiki --root ./wiki <command>");
    // Regression (#71): the absolute path of the binary that ran `init` is
    // meaningless in every other checkout, and SCHEMA.md is committed.
    expect(schema).not.toContain(binary);
  });

  test("the documented invocation actually runs, from a checkout that never scaffolded", () => {
    const project = mkdtempSync(join(tmpdir(), "init-compiled-proj-"));
    expect(spawnSync(binary, ["--root", "./wiki", "init"], { cwd: project }).status).toBe(0);

    // A second machine: the binary lives under a skill install the scaffolding
    // run knew nothing about, and only the committed shim is there to find it.
    const home = mkdtempSync(join(tmpdir(), "init-compiled-home-"));
    const installed = join(home, ".claude/skills/ymir/wiki-cli/bin/wiki");
    mkdirSync(dirname(installed), { recursive: true });
    symlinkSync(binary, installed);

    const run = spawnSync("./wiki/bin/wiki", ["--root", "./wiki", "validate"], {
      cwd: project,
      encoding: "utf8",
      env: { HOME: home, PATH: "/usr/bin:/bin" },
    });

    expect(run.stdout).toContain("wiki valid");
    expect(run.status).toBe(0);
  });
});
