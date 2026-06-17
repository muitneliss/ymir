import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = join(here, "..", "..", "templates", "hooks", "block-wiki-edits.mjs");

function runHook(input: object) {
  const r = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  return { stdout: r.stdout, status: r.status };
}

describe("block-wiki-edits hook", () => {
  it("denies Write to wiki/notes", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/notes/a.md" } });
    expect(stdout).toContain('"permissionDecision": "deny"');
  });
  it("denies Edit to wiki/index.md", () => {
    const { stdout } = runHook({ tool_name: "Edit", cwd: "/p", tool_input: { file_path: "/p/wiki/index.md" } });
    expect(stdout).toContain('"permissionDecision": "deny"');
  });
  it("allows Write to wiki/raw", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/raw/a.pdf" } });
    expect(stdout.trim()).toBe("");
  });
  it("allows Write to wiki/SCHEMA.md", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/SCHEMA.md" } });
    expect(stdout.trim()).toBe("");
  });
  it("allows unrelated files", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/src/app.ts" } });
    expect(stdout.trim()).toBe("");
  });
});
