import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage, writePage } from "../src/store.js";
import { runNote } from "../src/commands/note.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("runNote", () => {
  it("creates a validated note, rebuilds index, appends log", async () => {
    await runNote({
      root, type: "concept", name: "Token Bucket",
      body: "A rate limiter.", today: "2026-06-17",
    });
    const page = readPage(join(root, "notes", "token-bucket.md"));
    expect(page).toContain("type: concept");
    expect(readPage(join(root, "index.md"))).toContain("[Token Bucket](notes/token-bucket.md)");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-06-17] note | Token Bucket");
  });

  it("rejects on broken link and writes nothing", async () => {
    await expect(runNote({
      root, type: "concept", name: "X", body: "see [[Ghost]]", today: "2026-06-17",
    })).rejects.toThrow(/broken link/);
    expect(existsSync(join(root, "notes", "x.md"))).toBe(false);
  });

  it("preserves an existing note's source_count when the body is updated", async () => {
    writePage(
      join(root, "notes", "token-bucket.md"),
      "---\ntitle: Token Bucket\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 3\n---\n\n# Token Bucket\n\nOriginal.\n",
    );
    await runNote({
      root, type: "concept", name: "Token Bucket",
      body: "Updated body.", today: "2026-06-18",
    });
    const page = readPage(join(root, "notes", "token-bucket.md"));
    expect(page).toContain("source_count: 3");
    expect(page).toContain("Updated body.");
  });
});
