import { describe, it, expect } from "bun:test";
import { expandContext } from "../src/context.js";

const PAGE = `---
title: Example
---

# Example Page

Intro paragraph about the overall system and what it is for.

## Alpha

Alpha detail one, which explains the alpha mechanism in depth.

Alpha detail two, containing the SPECIFIC_FACT we care about.

Alpha detail three, some trailing elaboration.

## Beta

Beta is a completely different topic and must not leak into an alpha answer.

Beta detail two.`;

const lineOf = (needle: string): number =>
  PAGE.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("expandContext", () => {
  it("returns the paragraph containing the match", () => {
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 200);
    expect(out).toContain("SPECIFIC_FACT");
  });

  it("expands to neighbouring paragraphs within the budget", () => {
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 1200);
    expect(out).toContain("Alpha detail one");
    expect(out).toContain("Alpha detail three");
  });

  // These exercise the narrowing path, so the budget must be below the page
  // size — a page that fits is returned whole by design.
  it("never crosses into another section", () => {
    // A heading is a topic change; Beta cannot answer an Alpha question.
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 300);
    expect(out).not.toContain("Beta is a completely different topic");
    expect(out).not.toContain("Beta detail two");
  });

  it("leads with the section heading so the passage is self-describing", () => {
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 300);
    expect(out.startsWith("## Alpha")).toBe(true);
  });

  it("respects the budget", () => {
    const small = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 120);
    const large = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 1200);
    expect(small.length).toBeLessThan(large.length);
  });

  it("handles a match on a blank line", () => {
    const blank = PAGE.split("\n").findIndex((l) => l.trim() === "") + 1;
    expect(() => expandContext(PAGE, blank, 400)).not.toThrow();
    expect(expandContext(PAGE, blank, 400).length).toBeGreaterThan(0);
  });

  it("handles a line number past the end of the page", () => {
    const out = expandContext(PAGE, 9999, 400);
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns something for a page with no headings", () => {
    const plain = "Just one paragraph.\n\nAnd a second one.";
    const out = expandContext(plain, 1, 500);
    expect(out).toContain("Just one paragraph.");
  });

  it("returns empty string for empty input", () => {
    expect(expandContext("", 1, 500)).toBe("");
  });
});

describe("expandContext budget adaptation", () => {
  it("returns a small page whole rather than trimming it", () => {
    // Trimming a page that already fits can only lose the answer.
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 5000);
    expect(out).toContain("Intro paragraph");
    expect(out).toContain("SPECIFIC_FACT");
    expect(out).toContain("Beta detail two");
  });

  it("drops frontmatter when returning a whole page", () => {
    const out = expandContext(PAGE, lineOf("SPECIFIC_FACT"), 5000);
    expect(out).not.toContain("title: Example");
    expect(out).not.toContain("---");
  });

  it("narrows to the section once the page exceeds the budget", () => {
    const big = PAGE + "\n\n## Gamma\n\n" + "filler. ".repeat(600);
    const out = expandContext(big, lineOf("SPECIFIC_FACT"), 1500);
    expect(out).toContain("SPECIFIC_FACT");
    expect(out).not.toContain("filler.");
    expect(out.length).toBeLessThanOrEqual(1600);
  });
});
