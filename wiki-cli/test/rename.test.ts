import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { runIngest } from "../src/commands/ingest.js";
import { runNote } from "../src/commands/note.js";
import { runRename } from "../src/commands/rename.js";

const noReindex = true;

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("runRename", () => {
  it("renames a source page: new file exists, old file gone, index updated, log appended", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Old Name", body: "Content.", today: "2026-08-18", noReindex });

    const result = await runRename({ root, oldTitle: "Old Name", newTitle: "New Name", today: "2026-08-18", noReindex });

    expect(result.renamed).toBe(true);
    expect(existsSync(join(root, "sources", "new-name.md"))).toBe(true);
    expect(existsSync(join(root, "sources", "old-name.md"))).toBe(false);
    expect(readPage(join(root, "sources", "new-name.md"))).toContain("title: New Name");
    expect(readPage(join(root, "index.md"))).toContain("[New Name](sources/new-name.md)");
    expect(readPage(join(root, "index.md"))).not.toContain("[Old Name]");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-08-18] rename | Old Name → New Name");
  });

  it("updates inbound wiki links in other pages to the new title", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Old Name", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/b.pdf", title: "Ref Page", body: "See [[Old Name]] here.", today: "2026-08-18", noReindex });

    await runRename({ root, oldTitle: "Old Name", newTitle: "New Name", today: "2026-08-18", noReindex });

    expect(readPage(join(root, "sources", "ref-page.md"))).toContain("[[New Name]]");
    expect(readPage(join(root, "sources", "ref-page.md"))).not.toContain("[[Old Name]]");
  });

  it("renames a note page", async () => {
    await runNote({ root, type: "concept", name: "My Concept", body: "Details.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "See [[My Concept]].", today: "2026-08-18", noReindex });

    await runRename({ root, oldTitle: "My Concept", newTitle: "Better Concept", today: "2026-08-18", noReindex });

    expect(existsSync(join(root, "notes", "better-concept.md"))).toBe(true);
    expect(existsSync(join(root, "notes", "my-concept.md"))).toBe(false);
    expect(readPage(join(root, "sources", "doc-a.md"))).toContain("[[Better Concept]]");
  });

  it("rejects rename when old page does not exist", async () => {
    await expect(runRename({ root, oldTitle: "Ghost", newTitle: "Real", today: "2026-08-18", noReindex })).rejects.toThrow(/not found/);
  });

  it("rejects rename when new title slug collides with a different page", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/b.pdf", title: "Doc B", body: "Content.", today: "2026-08-18", noReindex });

    await expect(runRename({ root, oldTitle: "Doc A", newTitle: "Doc B", today: "2026-08-18", noReindex })).rejects.toThrow(/collision/);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(true);
    expect(existsSync(join(root, "sources", "doc-b.md"))).toBe(true);
  });

  it("updates self-references when renaming a self-linking page", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "See [[Doc A]].", today: "2026-08-18", noReindex });

    await runRename({ root, oldTitle: "Doc A", newTitle: "Doc B", today: "2026-08-18", noReindex });

    const content = readPage(join(root, "sources", "doc-b.md"));
    expect(content).toContain("[[Doc B]]");
    expect(content).not.toContain("[[Doc A]]");
  });

  it("preview mode returns plan and counts updated links without mutating files", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Old Name", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/b.pdf", title: "Ref Page", body: "See [[Old Name]].", today: "2026-08-18", noReindex });

    const result = await runRename({ root, oldTitle: "Old Name", newTitle: "New Name", today: "2026-08-18", noReindex, preview: true });

    expect(result.renamed).toBe(false);
    expect(result.linksUpdated).toBe(1);
    expect(existsSync(join(root, "sources", "old-name.md"))).toBe(true);
    expect(existsSync(join(root, "sources", "new-name.md"))).toBe(false);
  });

  it("reports the paths of files where inbound links would be updated", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Old Name", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/b.pdf", title: "Ref Page", body: "See [[Old Name]].", today: "2026-08-18", noReindex });

    const result = await runRename({ root, oldTitle: "Old Name", newTitle: "New Name", today: "2026-08-18", noReindex, preview: true });

    expect(result.affectedPaths).toContain(join(root, "sources", "ref-page.md"));
  });
});
