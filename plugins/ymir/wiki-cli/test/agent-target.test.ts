import { describe, test, expect, beforeEach } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../src/commands/init.js";

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "agent-target-")); });

describe("runInit with skipHook: true (non-Claude target)", () => {
  test("does not write .claude/hooks/block-wiki-edits.mjs", () => {
    runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(existsSync(join(proj, ".claude/hooks/block-wiki-edits.mjs"))).toBe(false);
  });

  test("does not write .claude/settings.json", () => {
    runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(existsSync(join(proj, ".claude/settings.json"))).toBe(false);
  });

  test("does not append to CLAUDE.md", () => {
    runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(existsSync(join(proj, "CLAUDE.md"))).toBe(false);
  });

  test("still scaffolds wiki files", () => {
    runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    for (const f of ["raw/.gitkeep", "sources/.gitkeep", "notes/.gitkeep", "SCHEMA.md", "index.md", "log.md"]) {
      expect(existsSync(join(proj, "wiki", f))).toBe(true);
    }
  });

  test("reports hookSkipped: true in summary", () => {
    const s = runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(s.hookSkipped).toBe(true);
  });

  test("reports settingsMerged: false in summary", () => {
    const s = runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(s.settingsMerged).toBe(false);
  });

  test("reports claudeBlockAppended: false in summary", () => {
    const s = runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(s.claudeBlockAppended).toBe(false);
  });

  test("wiki is still valid", () => {
    const s = runInit({ projectRoot: proj, root: "wiki", skipHook: true });
    expect(s.valid).toBe(true);
  });
});

describe("runInit regression: default behavior unchanged (Claude Code target)", () => {
  test("still writes .claude/hooks/block-wiki-edits.mjs by default", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    expect(existsSync(join(proj, ".claude/hooks/block-wiki-edits.mjs"))).toBe(true);
  });

  test("still merges .claude/settings.json by default", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    expect(existsSync(join(proj, ".claude/settings.json"))).toBe(true);
    const s = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf-8"));
    expect(s.hooks?.PreToolUse?.length).toBeGreaterThan(0);
  });

  test("still appends to CLAUDE.md by default", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    expect(existsSync(join(proj, "CLAUDE.md"))).toBe(true);
    const md = readFileSync(join(proj, "CLAUDE.md"), "utf-8");
    expect(md).toContain("## Wiki / Context");
  });

  test("reports hookSkipped: false by default", () => {
    const s = runInit({ projectRoot: proj, root: "wiki" });
    expect(s.hookSkipped).toBe(false);
  });
});
