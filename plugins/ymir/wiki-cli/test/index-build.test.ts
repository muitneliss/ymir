import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "../src/store.js";
import { buildIndex } from "../src/index-build.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("buildIndex", () => {
  it("catalogs sources and notes by category with links", () => {
    writePage(join(root, "sources", "doc-a.md"),
      "---\ntitle: Doc A\ntype: source\ndate: 2026-06-17\ntags: []\nsource: raw/a.pdf\ningested: 2026-06-17\n---\n# Doc A\n");
    writePage(join(root, "notes", "token-bucket.md"),
      "---\ntitle: Token Bucket\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 1\n---\n# Token Bucket\n");
    const md = buildIndex(root);
    expect(md).toContain("# Wiki Index");
    expect(md).toContain("## Sources");
    expect(md).toContain("[Doc A](sources/doc-a.md)");
    expect(md).toContain("## Notes");
    expect(md).toContain("[Token Bucket](notes/token-bucket.md)");
  });
});
