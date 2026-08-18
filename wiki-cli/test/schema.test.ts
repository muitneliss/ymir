import { describe, it, expect } from "bun:test";
import { sourceFrontmatter } from "../src/schema.js";

const base = {
  title: "Auth Module",
  type: "source" as const,
  date: "2026-06-17",
  tags: ["auth"],
  ingested: "2026-06-17",
};

describe("sourceFrontmatter", () => {
  it("accepts legacy page with only source field", () => {
    const result = sourceFrontmatter.safeParse({ ...base, source: "src/auth.ts" });
    expect(result.success).toBe(true);
  });

  it("accepts page with source_path and source_hash (no source)", () => {
    const result = sourceFrontmatter.safeParse({
      ...base,
      source_path: "src/auth.ts",
      source_hash: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts page with all three fields", () => {
    const result = sourceFrontmatter.safeParse({
      ...base,
      source: "src/auth.ts",
      source_path: "src/auth.ts",
      source_hash: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects page with neither source nor source_path", () => {
    const result = sourceFrontmatter.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it("accepts page with source_path but no source_hash (untracked)", () => {
    const result = sourceFrontmatter.safeParse({
      ...base,
      source_path: "src/auth.ts",
    });
    expect(result.success).toBe(true);
  });
});
