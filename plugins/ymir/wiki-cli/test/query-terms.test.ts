import { describe, it, expect } from "bun:test";
import { extractTerms } from "../src/query-terms.js";

describe("extractTerms", () => {
  it("strips interrogatives and function words from a question", () => {
    expect(extractTerms("When did Melanie paint a sunrise?")).toBe("melanie paint sunrise");
  });

  it("keeps every content word of a longer question", () => {
    expect(extractTerms("When did Caroline go to the LGBTQ support group?")).toBe(
      "caroline go lgbtq support group",
    );
  });

  it("preserves numbers and dates", () => {
    expect(extractTerms("What happened on 2023-05-08 with the 3 dogs?")).toBe(
      "happened 2023 05 08 3 dogs",
    );
  });

  it("splits possessives into their stem", () => {
    expect(extractTerms("What is Caroline's identity?")).toBe("caroline s identity");
  });

  it("falls back to the original query when only function words remain", () => {
    // Searching for nothing would be worse than searching for what was typed.
    expect(extractTerms("what is the")).toBe("what is the");
  });

  it("falls back to the original query for scripts the tokeniser drops", () => {
    expect(extractTerms("日本語")).toBe("日本語");
  });

  it("leaves an already-keyword query untouched", () => {
    expect(extractTerms("rate limiting backoff")).toBe("rate limiting backoff");
  });

  it("is idempotent", () => {
    const once = extractTerms("When did Melanie paint a sunrise?");
    expect(extractTerms(once)).toBe(once);
  });
});
