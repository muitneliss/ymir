import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runInit } from "../src/commands/init.js";
import { SETTINGS_HOOK_ENTRY } from "../src/templates/embedded.js";

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "init-")); });

describe("runInit", () => {
  it("scaffolds a valid wiki + hook + settings + CLAUDE.md", () => {
    const s = runInit({ projectRoot: proj, root: "wiki" });
    expect(s.valid).toBe(true);

    const wiki = join(proj, "wiki");
    for (const f of ["raw/.gitkeep", "sources/.gitkeep", "notes/.gitkeep", "SCHEMA.md", "index.md", "log.md"]) {
      expect(existsSync(join(wiki, f))).toBe(true);
    }
    const schema = readFileSync(join(wiki, "SCHEMA.md"), "utf8");
    expect(schema).not.toContain("PROJECT_NAME");
    expect(schema).toContain(basename(proj));

    expect(existsSync(join(proj, ".claude/hooks/block-wiki-edits.mjs"))).toBe(true);

    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);

    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude).toContain("## Wiki / Context");
    expect(s.claudeBlockAppended).toBe(true);
    expect(s.settingsMerged).toBe(true);
  });

  it("is idempotent: re-running does not duplicate or clobber", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    writeFileSync(join(proj, "wiki/notes/keep.md"), "# keep");
    const s = runInit({ projectRoot: proj, root: "wiki" });

    expect(readFileSync(join(proj, "wiki/notes/keep.md"), "utf8")).toBe("# keep");
    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude.match(/## Wiki \/ Context/g)?.length).toBe(1);
    expect(s.settingsMerged).toBe(false);
    expect(s.claudeBlockAppended).toBe(false);
  });

  it("respects --name override", () => {
    runInit({ projectRoot: proj, root: "wiki", name: "custom-proj" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8");
    expect(schema).toContain("custom-proj");
  });

  it("preserves existing CLAUDE.md content and unrelated settings hooks", () => {
    writeFileSync(join(proj, "CLAUDE.md"), "# Project\nexisting body\n");
    mkdirSync(join(proj, ".claude"), { recursive: true });
    writeFileSync(
      join(proj, ".claude/settings.json"),
      JSON.stringify({
        hooks: { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "x" }] }] },
      }),
    );
    runInit({ projectRoot: proj, root: "wiki" });
    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude).toContain("# Project\nexisting body");
    expect(claude).toContain("## Wiki / Context");
    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });
});
