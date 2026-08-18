import { describe, it, expect } from "bun:test";
import { renderSourcePage } from "../src/pages.js";
import { parseFrontmatter } from "../src/frontmatter.js";

describe("renderSourcePage provenance", () => {
  it("includes source_path and source_hash when provided", async () => {
    const md = await renderSourcePage({
      title: "Auth Module",
      source: "src/auth.ts",
      date: "2026-06-17",
      tags: [],
      body: "Summary of auth module.",
      sourcePath: "src/auth.ts",
      sourceHash: "abc123def456",
    });
    const { data } = parseFrontmatter(md);
    expect(data.source_path).toBe("src/auth.ts");
    expect(data.source_hash).toBe("abc123def456");
  });

  it("omits source_path and source_hash when not provided", async () => {
    const md = await renderSourcePage({
      title: "Auth Module",
      source: "src/auth.ts",
      date: "2026-06-17",
      tags: [],
      body: "Summary of auth module.",
    });
    const { data } = parseFrontmatter(md);
    expect(data.source_path).toBeUndefined();
    expect(data.source_hash).toBeUndefined();
  });
});
