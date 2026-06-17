import { describe, it, expect } from "bun:test";
import { parseFrontmatter, stringifyFrontmatter } from "../src/frontmatter.js";

describe("frontmatter", () => {
  it("round-trips data and keeps YYYY-MM-DD dates as strings (no Date coercion)", () => {
    const doc = stringifyFrontmatter("# H\n\nbody\n", {
      title: "T",
      date: "2026-06-17",
      tags: ["a"],
    });
    const { data, content } = parseFrontmatter(doc);
    expect(data.title).toBe("T");
    expect(typeof data.date).toBe("string");
    expect(data.date).toBe("2026-06-17");
    expect(data.tags).toEqual(["a"]);
    expect(content).toContain("body");
  });

  it("returns the raw input as content when there is no frontmatter", () => {
    const { data, content } = parseFrontmatter("# Just a heading\n\ntext\n");
    expect(data).toEqual({});
    expect(content).toBe("# Just a heading\n\ntext\n");
  });

  it("ignores YAML merge-key aliases (JSON_SCHEMA) instead of expanding them", () => {
    const malicious = "---\nbase: &a {x: 1}\nmerged:\n  <<: *a\n---\nbody\n";
    const { data } = parseFrontmatter(malicious);
    // Under JSON_SCHEMA the '<<' merge key is a literal key, not an expansion vector.
    expect((data.merged as Record<string, unknown>)["<<"]).toBeDefined();
    expect(data).not.toHaveProperty("x");
  });
});
