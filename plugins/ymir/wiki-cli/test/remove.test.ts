import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { runIngest } from "../src/commands/ingest.js";
import { runNote } from "../src/commands/note.js";
import { runRemove } from "../src/commands/remove.js";

const noReindex = true;

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("runRemove", () => {
  it("removes a source page and rebuilds index and appends log", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "Content.", today: "2026-08-18", noReindex });

    const result = runRemove({ root, title: "Doc A", today: "2026-08-18", noReindex });

    expect(result.removed).toBe(true);
    expect(result.inboundLinks).toHaveLength(0);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(false);
    expect(readPage(join(root, "index.md"))).not.toContain("[Doc A]");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-08-18] remove | Doc A");
  });

  it("removes a note page that has no inbound links", async () => {
    await runNote({ root, type: "entity", name: "My Note", body: "Details.", today: "2026-08-18", noReindex });

    const result = runRemove({ root, title: "My Note", today: "2026-08-18", noReindex });

    expect(result.removed).toBe(true);
    expect(existsSync(join(root, "notes", "my-note.md"))).toBe(false);
    expect(readPage(join(root, "index.md"))).not.toContain("[My Note]");
  });

  it("throws and leaves wiki unchanged when inbound links exist", async () => {
    await runIngest({ root, raw: "raw/b.pdf", title: "Doc B", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "See [[Doc B]].", today: "2026-08-18", noReindex });

    const prevDocB = readPage(join(root, "sources", "doc-b.md"));

    expect(() => runRemove({ root, title: "Doc B", today: "2026-08-18", noReindex })).toThrow(/inbound link/);
    expect(readPage(join(root, "sources", "doc-b.md"))).toBe(prevDocB);
  });

  it("reports inbound links in the thrown error", async () => {
    await runIngest({ root, raw: "raw/b.pdf", title: "Doc B", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "See [[Doc B]].", today: "2026-08-18", noReindex });

    let err: Error | undefined;
    try { runRemove({ root, title: "Doc B", today: "2026-08-18", noReindex }); }
    catch (e) { err = e as Error; }

    expect(err?.message).toContain("sources/doc-a.md");
    expect(err?.message).toContain("[[Doc B]]");
  });

  it("throws when page does not exist", () => {
    expect(() => runRemove({ root, title: "Ghost", today: "2026-08-18", noReindex })).toThrow(/not found/);
  });

  it("preview mode returns plan without mutating files", async () => {
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "Content.", today: "2026-08-18", noReindex });

    const result = runRemove({ root, title: "Doc A", today: "2026-08-18", noReindex, preview: true });

    expect(result.removed).toBe(false);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(true);
  });

  it("preview mode reports inbound links without throwing", async () => {
    await runIngest({ root, raw: "raw/b.pdf", title: "Doc B", body: "Content.", today: "2026-08-18", noReindex });
    await runIngest({ root, raw: "raw/a.pdf", title: "Doc A", body: "See [[Doc B]].", today: "2026-08-18", noReindex });

    const result = runRemove({ root, title: "Doc B", today: "2026-08-18", noReindex, preview: true });

    expect(result.removed).toBe(false);
    expect(result.inboundLinks.length).toBeGreaterThan(0);
    expect(result.inboundLinks[0]!.from).toContain("doc-a");
  });
});
