import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "../src/store.js";
import { validateWiki } from "../src/validate.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

const goodNote = (title: string, body = "") =>
  `---\ntitle: ${title}\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 0\n---\n# ${title}\n\n${body}\n`;

const goodSource = (title: string, body = "") =>
  `---\ntitle: ${title}\ntype: source\ndate: 2026-06-17\ntags: []\nsource: raw/a.pdf\ningested: 2026-06-17\n---\n# ${title}\n\n${body}\n`;

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

  it("flags slug collision between two Vietnamese titles that produce identical slugs", () => {
    writePage(join(root, "sources", "hi-u-tr-ng.md"), goodSource("Hiệu trưởng"));
    writePage(join(root, "notes", "hi-u-tr-ng.md"), goodNote("Hiếu trường"));
    const r = validateWiki(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("slug collision"))).toBe(true);
  });

  it("flags a hand-renamed file whose filename no longer matches its title", () => {
    writePage(join(root, "notes", "wrong-name.md"), goodNote("Right Name"));
    const r = validateWiki(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("wrong-name.md") && e.includes("filename"))).toBe(true);
  });

  it("flags markdown files in unsupported nested subdirectories", () => {
    mkdirSync(join(root, "notes", "subfolder"), { recursive: true });
    writePage(join(root, "notes", "subfolder", "deep.md"), goodNote("Deep Page"));
    const r = validateWiki(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("nested") && e.includes("subfolder"))).toBe(true);
  });

  it("ignores [[links]] inside inline code spans", () => {
    writePage(join(root, "sources", "a.md"), goodSource("A", "Use `[[Ghost]]` syntax for cross-references."));
    const r = validateWiki(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("ignores [[links]] inside fenced code blocks", () => {
    const body = "Example:\n\n```\necho 'see [[Ghost]]' | wiki ingest --title T\n```\n\nEnd.";
    writePage(join(root, "sources", "a.md"), goodSource("A", body));
    const r = validateWiki(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("still flags real broken [[links]] outside code", () => {
    writePage(join(root, "sources", "a.md"), goodSource("A", "See [[Ghost]] for details."));
    const r = validateWiki(root);
    expect(r.errors.some((e) => e.includes("broken link") && e.includes("Ghost"))).toBe(true);
  });
});
