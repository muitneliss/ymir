import { describe, it, expect } from "bun:test";
import { slugify, sourcePath, notePath, wikiPaths } from "../src/paths.js";

describe("slugify", () => {
  it("lowercases, trims, hyphenates", () => {
    expect(slugify("  Hello World!  ")).toBe("hello-world");
    expect(slugify("API & Auth/v2")).toBe("api-auth-v2");
  });
});

describe("paths", () => {
  it("builds source/note paths under root", () => {
    expect(sourcePath("/w", "My Title")).toBe("/w/sources/my-title.md");
    expect(notePath("/w", "Token Bucket")).toBe("/w/notes/token-bucket.md");
  });
  it("exposes core wiki paths", () => {
    const p = wikiPaths("/w");
    expect(p.index).toBe("/w/index.md");
    expect(p.log).toBe("/w/log.md");
    expect(p.sourcesDir).toBe("/w/sources");
    expect(p.notesDir).toBe("/w/notes");
  });
});
