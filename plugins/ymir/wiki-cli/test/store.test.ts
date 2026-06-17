import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage, readPage, listPages, appendFileLine } from "../src/store.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("store", () => {
  it("writes and reads a page (creating dirs)", () => {
    const p = join(root, "notes", "a.md");
    writePage(p, "hello");
    expect(readPage(p)).toBe("hello");
  });
  it("lists .md files in a dir, empty if missing", () => {
    expect(listPages(join(root, "notes"))).toEqual([]);
    writePage(join(root, "notes", "a.md"), "x");
    writePage(join(root, "notes", "b.md"), "y");
    expect(listPages(join(root, "notes")).sort()).toEqual(["a.md", "b.md"]);
  });
  it("appends a line to a file", () => {
    const f = join(root, "log.md");
    appendFileLine(f, "line1");
    appendFileLine(f, "line2");
    expect(readPage(f)).toBe("line1\nline2\n");
  });
});
