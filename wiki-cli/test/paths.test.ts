import { describe, it, expect } from "bun:test";
import { slugify, sourcePath, notePath, wikiPaths } from "../src/paths.js";

describe("slugify", () => {
  it("lowercases, trims, hyphenates", () => {
    expect(slugify("  Hello World!  ")).toBe("hello-world");
    expect(slugify("API & Auth/v2")).toBe("api-auth-v2");
  });
  it("keeps the base letter of accented and Vietnamese letters instead of dropping them", () => {
    expect(slugify("Bản đồ repo và nơi sửa")).toBe("ban-do-repo-va-noi-sua");
    expect(slugify("Đội agent Marketing")).toBe("doi-agent-marketing");
    expect(slugify("Crème brûlée à Zürich")).toBe("creme-brulee-a-zurich");
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
