import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
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
    expect(schema).not.toContain("{{WIKI_BIN}}");
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

/**
 * The shim is what makes the committed `SCHEMA.md` invocation resolve in a
 * checkout that never ran `init` — a different machine, a different install
 * layout, or CI. It is scaffolded output, so `init` owns it the way it owns the
 * PreToolUse hook: always rewritten, never left at an older revision.
 */
describe("runInit wiki binary shim", () => {
  it("writes an executable shim inside the wiki root", () => {
    const s = runInit({ projectRoot: proj, root: "wiki" });
    const shim = join(proj, "wiki/bin/wiki");

    expect(existsSync(shim)).toBe(true);
    expect(statSync(shim).mode & 0o111).not.toBe(0);
    expect(readFileSync(shim, "utf8").startsWith("#!/bin/sh")).toBe(true);
    expect(s.created).toContain(shim);
  });

  it("refreshes a stale shim instead of leaving an old revision in place", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    const shim = join(proj, "wiki/bin/wiki");
    writeFileSync(shim, "#!/bin/sh\nexit 1\n");

    runInit({ projectRoot: proj, root: "wiki" });

    expect(readFileSync(shim, "utf8")).toContain("YMIR_WIKI_BIN");
  });

  it("tells the agent which command to use when it denies an edit", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    const hook = readFileSync(join(proj, ".claude/hooks/block-wiki-edits.mjs"), "utf8");

    expect(hook).toContain("./wiki/bin/wiki --root ./wiki");
    expect(hook).not.toContain("{{WIKI_BIN}}");
  });
});

/**
 * Issue #71: wikis scaffolded before the shim existed carry a committed
 * invocation naming one machine's absolute path. Re-running `init` is the only
 * repair route those repos have, and `SCHEMA.md` already exists by then.
 */
describe("runInit repairs a stale SCHEMA.md invocation", () => {
  const staleSchema = [
    "# Wiki Schema & Rules",
    "",
    "## The CLI",
    "Invoke via the bundled binary:",
    "",
    "```",
    "/Users/someone/.claude/skills/ymir/wiki-cli/bin/wiki --root ./wiki <command>",
    "```",
    "",
    "Run `... help` for the full command reference.",
    "",
    "## Page conventions",
    "- Hand-written guidance the project added itself.",
    "",
  ].join("\n");

  it("rewrites the invocation to the shim and reports it", () => {
    mkdirSync(join(proj, "wiki"), { recursive: true });
    writeFileSync(join(proj, "wiki/SCHEMA.md"), staleSchema);

    const s = runInit({ projectRoot: proj, root: "wiki" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8");

    expect(schema).toContain("./wiki/bin/wiki --root ./wiki <command>");
    expect(schema).not.toContain("/Users/someone");
    expect(s.schemaRepaired).toBe(true);
  });

  it("leaves the rest of a customized SCHEMA.md untouched", () => {
    mkdirSync(join(proj, "wiki"), { recursive: true });
    writeFileSync(join(proj, "wiki/SCHEMA.md"), staleSchema);

    runInit({ projectRoot: proj, root: "wiki" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8");

    expect(schema).toContain("Hand-written guidance the project added itself.");
    expect(schema).toContain("Run `... help` for the full command reference.");
  });

  it("is idempotent — a SCHEMA.md already naming the shim is not touched", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    const before = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8");

    const s = runInit({ projectRoot: proj, root: "wiki" });

    expect(readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8")).toBe(before);
    expect(s.schemaRepaired).toBe(false);
  });
});
