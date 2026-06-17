import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "../src/store.js";
import { validateWiki } from "../src/validate.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

const goodNote = (title: string, body = "") =>
  `---\ntitle: ${title}\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 0\n---\n# ${title}\n\n${body}\n`;

describe("validateWiki", () => {
  it("passes a clean wiki", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A", "see [[B]]"));
    writePage(join(root, "notes", "b.md"), goodNote("B", "see [[A]]"));
    const r = validateWiki(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("flags bad frontmatter", () => {
    writePage(join(root, "notes", "bad.md"), "---\ntitle: X\ntype: nope\n---\n# X\n");
    const r = validateWiki(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("frontmatter"))).toBe(true);
  });
  it("flags broken wikilinks", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A", "see [[Ghost]]"));
    const r = validateWiki(root);
    expect(r.errors.some((e) => e.includes("broken link") && e.includes("Ghost"))).toBe(true);
  });
  it("warns on orphan notes", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A"));
    const r = validateWiki(root);
    expect(r.warnings.some((w) => w.includes("orphan") && w.includes("A"))).toBe(true);
  });
});
