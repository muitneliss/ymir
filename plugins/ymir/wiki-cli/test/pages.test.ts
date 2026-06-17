import { describe, it, expect } from "vitest";
import { renderSourcePage, renderNotePage } from "../src/pages.js";

describe("renderSourcePage", () => {
  it("emits validated frontmatter + body", async () => {
    const out = await renderSourcePage({
      title: "My Doc", source: "raw/my-doc.pdf", date: "2026-06-17",
      tags: ["x"], body: "Key point.",
    });
    expect(out).toContain("type: source");
    expect(out).toContain("source: raw/my-doc.pdf");
    expect(out).toContain("# My Doc");
    expect(out).toContain("Key point.");
  });
});

describe("renderNotePage", () => {
  it("emits note frontmatter + body", async () => {
    const out = await renderNotePage({
      name: "Token Bucket", type: "concept", date: "2026-06-17",
      tags: [], sourceCount: 1, body: "A rate limiter.",
    });
    expect(out).toContain("type: concept");
    expect(out).toContain("source_count: 1");
    expect(out).toContain("# Token Bucket");
  });
  it("throws on invalid frontmatter", async () => {
    await expect(renderNotePage({
      name: "", type: "concept", date: "bad", tags: [], sourceCount: 0, body: "x",
    })).rejects.toThrow();
  });
});
