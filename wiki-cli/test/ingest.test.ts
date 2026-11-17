import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, existsSync, renameSync } from "node:fs";
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
      noReindex: true,
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
      noReindex: true,
    })).rejects.toThrow(/broken link/);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(false);
  });

  it("preserves the existing source page when a re-ingest fails validation", async () => {
    await runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "Original body. See [[Doc A]].", today: "2026-06-17",
      noReindex: true,
    });
    const original = readPage(join(root, "sources", "doc-a.md"));

    await expect(runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "Broken update. See [[Ghost]].", today: "2026-06-18",
      noReindex: true,
    })).rejects.toThrow(/broken link/);

    expect(readPage(join(root, "sources", "doc-a.md"))).toBe(original);
  });

  it("moves a page named by the pre-0.9.3 slug to its readable name on re-ingest, without a duplicate", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Bản đồ", body: "First.", today: "2026-06-17", noReindex: true });
    renameSync(join(root, "sources", "ban-do.md"), join(root, "sources", "b-n.md")); // as a 0.9.2 CLI named it

    await runIngest({ root, raw: "raw/a.pdf", title: "Bản đồ", body: "Second.", today: "2026-06-18", noReindex: true });

    expect(existsSync(join(root, "sources", "b-n.md"))).toBe(false);
    expect(readPage(join(root, "sources", "ban-do.md"))).toContain("Second.");
  });

  it("rejects a title whose slug collides with an existing page of a different title", async () => {
    await runIngest({
      root, raw: "raw/a.pdf", title: "Hiệu trưởng",
      body: "See [[Hiệu trưởng]].", today: "2026-06-17",
      noReindex: true,
    });
    const original = readPage(join(root, "sources", "hieu-truong.md"));

    await expect(runIngest({
      root, raw: "raw/b.pdf", title: "Hiếu trường",
      body: "See [[Hiệu trưởng]].", today: "2026-06-18",
      noReindex: true,
    })).rejects.toThrow(/collision/);

    expect(readPage(join(root, "sources", "hieu-truong.md"))).toBe(original);
  });
});
