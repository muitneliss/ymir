import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCheckCmd } from "../src/commands/check.js";
import { buildIndex } from "../src/index-build.js";
import { writePage } from "../src/store.js";

function initProject(): { projectRoot: string; root: string } {
  const projectRoot = mkdtempSync(join(tmpdir(), "check-cmd-"));
  const root = join(projectRoot, "wiki");
  mkdirSync(join(root, "sources"), { recursive: true });
  mkdirSync(join(root, "notes"), { recursive: true });
  return { projectRoot, root };
}

function writeIndex(root: string): void {
  writePage(join(root, "index.md"), buildIndex(root));
}

let projectRoot: string;
let root: string;

beforeEach(() => {
  ({ projectRoot, root } = initProject());
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("runCheckCmd", () => {
  it("exits 0 and prints 'wiki ok' for a clean wiki", () => {
    writeIndex(root);
    const r = runCheckCmd({ root, json: false, errorOnOrphanNotes: false, errorOnUntrackedSources: false });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("wiki ok");
  });

  it("exits 1 with human-readable lines for errors", () => {
    writeFileSync(join(root, "notes", "bad.md"), "---\ntitle: Bad\ntype: nope\n---\n# Bad\n");
    const r = runCheckCmd({ root, json: false, errorOnOrphanNotes: false, errorOnUntrackedSources: false });
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("error:");
  });

  it("includes warnings in human output", () => {
    writeFileSync(
      join(root, "notes", "alone.md"),
      "---\ntitle: alone\ntype: concept\ndate: 2026-01-01\ntags: []\nsource_count: 0\n---\n# alone\n",
    );
    writeIndex(root);
    const r = runCheckCmd({ root, json: false, errorOnOrphanNotes: false, errorOnUntrackedSources: false });
    expect(r.text).toContain("warning:");
  });

  it("emits valid JSON when --json is set", () => {
    writeIndex(root);
    const r = runCheckCmd({ root, json: true, errorOnOrphanNotes: false, errorOnUntrackedSources: false });
    const parsed = JSON.parse(r.text) as { ok: boolean; errors: unknown[]; warnings: unknown[] };
    expect(typeof parsed.ok).toBe("boolean");
    expect(Array.isArray(parsed.errors)).toBe(true);
    expect(Array.isArray(parsed.warnings)).toBe(true);
  });

  it("exits 1 when errorOnOrphanNotes is true and orphan exists", () => {
    writeFileSync(
      join(root, "notes", "alone.md"),
      "---\ntitle: alone\ntype: concept\ndate: 2026-01-01\ntags: []\nsource_count: 0\n---\n# alone\n",
    );
    writeIndex(root);
    const r = runCheckCmd({ root, json: false, errorOnOrphanNotes: true, errorOnUntrackedSources: false });
    expect(r.exitCode).toBe(1);
  });
});
