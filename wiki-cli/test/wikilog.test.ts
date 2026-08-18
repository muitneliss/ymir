import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { appendLog } from "../src/wikilog.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("appendLog", () => {
  it("appends a greppable dated entry", () => {
    appendLog(root, "ingest", "Doc A", "2026-06-17");
    const md = readPage(join(root, "log.md"));
    expect(md).toContain("## [2026-06-17] ingest | Doc A");
  });
});
