import { describe, it, expect } from "bun:test";
import { sourceFrontmatter, noteFrontmatter, NoteType } from "../src/schema.js";

describe("sourceFrontmatter", () => {
  it("accepts valid source frontmatter", () => {
    const r = sourceFrontmatter.safeParse({
      title: "T", type: "source", date: "2026-06-17",
      tags: ["a"], source: "raw/t.pdf", ingested: "2026-06-17",
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing source path", () => {
    const r = sourceFrontmatter.safeParse({
      title: "T", type: "source", date: "2026-06-17", tags: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("noteFrontmatter", () => {
  it("accepts valid note frontmatter", () => {
    const r = noteFrontmatter.safeParse({
      title: "Token Bucket", type: "concept", date: "2026-06-17",
      tags: [], source_count: 2,
    });
    expect(r.success).toBe(true);
  });
  it("rejects bad note type", () => {
    const r = noteFrontmatter.safeParse({
      title: "X", type: "source", date: "2026-06-17", tags: [], source_count: 0,
    });
    expect(r.success).toBe(false);
  });
  it("enumerates note types", () => {
    expect(NoteType.options).toEqual(["entity", "concept", "topic"]);
  });
});
