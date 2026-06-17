import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { runIngest } from "../src/commands/ingest.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("runIngest", () => {
  it("writes a validated source page, rebuilds index, appends log", async () => {
    await runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "Key takeaway. See [[Doc A]].", today: "2026-06-17",
    });
    const page = readPage(join(root, "sources", "doc-a.md"));
    expect(page).toContain("type: source");
    expect(page).toContain("source: raw/a.pdf");
    expect(readPage(join(root, "index.md"))).toContain("[Doc A](sources/doc-a.md)");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-06-17] ingest | Doc A");
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(true);
  });

  it("rejects when result fails validation (no file written)", async () => {
    await expect(runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "See [[Ghost]].", today: "2026-06-17",
    })).rejects.toThrow(/broken link/);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(false);
  });
});
