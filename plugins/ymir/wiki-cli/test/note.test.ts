import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
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
});
