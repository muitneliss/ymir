import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage, readPage, listPages, appendFileLine } from "../src/store.js";
import { Rejection } from "../src/rejection.js";

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

/**
 * A directory standing where a page belongs is a broken working tree, not a bug
 * in the CLI — but it used to surface as `EISDIR: illegal operation on a
 * directory, open 'wiki/index.md'` and a prompt to file it upstream (issue #58).
 * The tree is the user's to fix, so say what is wrong and what to do about it.
 */
describe("store refuses a directory standing where a file belongs", () => {
  it("rejects writePage with the path and a remedy", () => {
    const p = join(root, "index.md");
    mkdirSync(p, { recursive: true });

    expect(() => writePage(p, "x")).toThrow(Rejection);
    expect(() => writePage(p, "x")).toThrow(/index\.md is a directory/);
    expect(() => writePage(p, "x")).toThrow(/remove or rename it/);
  });

  it("rejects appendFileLine the same way", () => {
    const p = join(root, "log.md");
    mkdirSync(p, { recursive: true });

    expect(() => appendFileLine(p, "x")).toThrow(Rejection);
    expect(() => appendFileLine(p, "x")).toThrow(/log\.md is a directory/);
  });
});
