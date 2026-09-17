import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  test("scaffolds a valid wiki and records its own path as the command", () => {
    const project = mkdtempSync(join(tmpdir(), "init-compiled-proj-"));
    const run = spawnSync(binary, ["--root", "./wiki", "init"], {
      cwd: project,
      encoding: "utf8",
    });

    // Regression: this exited 1 with "ENOENT: lstat 'bun'" (#64, #65).
    expect(run.status).toBe(0);

    const schema = readFileSync(join(project, "wiki", "SCHEMA.md"), "utf8");
    expect(schema).toContain(`${binary} --root ./wiki <command>`);
  });
});
