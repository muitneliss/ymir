import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "../src/commands/init.js";

const skillRoot = join(import.meta.dir, "../..");
const hooksDir = join(skillRoot, "hooks");
const templatesDir = join(skillRoot, "templates");
const wikiCliTemplatesDir = join(skillRoot, "wiki-cli/src/templates");

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function occurrences(text: string, needle: string): number {
  return (text.match(new RegExp(needle.replace(/[${}]/g, "\\$&"), "g")) ?? []).length;
}

describe("CLAUDE_PLUGIN_ROOT absent from skill body", () => {
  test("SKILL.md has zero CLAUDE_PLUGIN_ROOT occurrences", () => {
    const text = readText(join(skillRoot, "SKILL.md"));
    expect(occurrences(text, "${CLAUDE_PLUGIN_ROOT}")).toBe(0);
  });

  test("templates/playbook/wiki.md has zero CLAUDE_PLUGIN_ROOT occurrences", () => {
    const text = readText(join(templatesDir, "playbook/wiki.md"));
    expect(occurrences(text, "${CLAUDE_PLUGIN_ROOT}")).toBe(0);
  });

  test("wiki-cli SCHEMA.md template has zero CLAUDE_PLUGIN_ROOT occurrences", () => {
    const text = readText(join(wikiCliTemplatesDir, "wiki/SCHEMA.md"));
    expect(occurrences(text, "${CLAUDE_PLUGIN_ROOT}")).toBe(0);
  });
});

describe("ensure-wiki-binary.mjs self-location", () => {
  const scriptPath = join(hooksDir, "ensure-wiki-binary.mjs");

  test("script file exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  test("script uses import.meta.url for self-location (not just CLAUDE_PLUGIN_ROOT)", () => {
    const text = readText(scriptPath);
    expect(text).toContain("import.meta.url");
  });

  test("script does not unconditionally exit(2) on missing CLAUDE_PLUGIN_ROOT", () => {
    const text = readText(scriptPath);
    const hasUnconditionalExit =
      /if\s*\(!PLUGIN_ROOT\)[\s\S]*?process\.exit\(2\)/m.test(text) &&
      !text.includes("import.meta.url");
    expect(hasUnconditionalExit).toBe(false);
  });
});

describe("wiki-sync-status.mjs self-location", () => {
  const scriptPath = join(hooksDir, "wiki-sync-status.mjs");

  test("script uses import.meta.url or works when CLAUDE_PLUGIN_ROOT is absent", () => {
    const text = readText(scriptPath);
    const hasImportMeta = text.includes("import.meta.url");
    const gracefulAbsence = /if\s*\(.*!PLUGIN_ROOT.*\)[\s\S]*?process\.exit\(0\)/.test(text);
    expect(hasImportMeta || gracefulAbsence).toBe(true);
  });
});

describe("runInit emits the concrete wiki binary path into SCHEMA.md", () => {
  let proj: string;
  beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "schema-bin-")); });

  test("SCHEMA.md has no {{WIKI_BIN}} placeholder — it is replaced at scaffold time", () => {
    runInit({ projectRoot: proj, root: "wiki", wikiBin: "/usr/local/bin/wiki" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf-8");
    expect(schema).not.toContain("{{WIKI_BIN}}");
  });

  test("SCHEMA.md contains the injected binary path", () => {
    runInit({ projectRoot: proj, root: "wiki", wikiBin: "/opt/tools/wiki" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf-8");
    expect(schema).toContain("/opt/tools/wiki");
  });

  test("SCHEMA.md has no CLAUDE_PLUGIN_ROOT in emitted output", () => {
    runInit({ projectRoot: proj, root: "wiki", wikiBin: "/usr/local/bin/wiki" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf-8");
    expect(occurrences(schema, "${CLAUDE_PLUGIN_ROOT}")).toBe(0);
  });
});
