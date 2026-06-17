import { describe, it, expect } from "vitest";
import { formatMarkdown } from "../src/format.js";

describe("formatMarkdown", () => {
  it("normalizes and is idempotent", async () => {
    const messy = "# Title\n\n\n\nsome   text\n";
    const once = await formatMarkdown(messy);
    const twice = await formatMarkdown(once);
    expect(once).toBe(twice);
    expect(once).toContain("# Title");
  });
  it("preserves frontmatter block", async () => {
    const src = "---\ntitle: T\n---\n# H\n";
    const out = await formatMarkdown(src);
    expect(out.startsWith("---")).toBe(true);
    expect(out).toContain("title: T");
  });
});
