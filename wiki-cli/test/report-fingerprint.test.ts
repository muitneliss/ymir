import { describe, it, expect } from "bun:test";
import { fingerprint, type ReportDraft } from "../src/report/model.js";

const BASE: ReportDraft = {
  kind: "cli-error",
  command: "wiki note",
  errorName: "ZodError",
  message: "Invalid option: expected one of entity|concept|topic",
};

describe("fingerprint", () => {
  it("is a short stable hex id", () => {
    const fp = fingerprint(BASE);
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fingerprint({ ...BASE })).toBe(fp);
  });

  it("collapses counts so one bug is one issue", () => {
    const a = fingerprint({ ...BASE, message: "index rebuild failed after 3 pages" });
    const b = fingerprint({ ...BASE, message: "index rebuild failed after 47 pages" });
    expect(a).toBe(b);
  });

  it("separates different commands", () => {
    expect(fingerprint({ ...BASE, command: "wiki ingest" })).not.toBe(fingerprint(BASE));
  });

  it("separates different error types", () => {
    expect(fingerprint({ ...BASE, errorName: "TypeError" })).not.toBe(fingerprint(BASE));
  });

  it("separates different kinds", () => {
    expect(fingerprint({ ...BASE, kind: "feedback" })).not.toBe(fingerprint(BASE));
  });

  it("ignores the stack — the shipped compiled binary emits no frames", () => {
    const withStack = fingerprint({ ...BASE, stack: "at foo (/Users/alice/x.ts:1:1)" });
    const withOther = fingerprint({ ...BASE, stack: "at bar (/home/bob/y.ts:9:9)" });
    expect(withStack).toBe(fingerprint(BASE));
    expect(withOther).toBe(fingerprint(BASE));
  });

  it("is unaffected by surrounding whitespace or case in the message", () => {
    expect(fingerprint({ ...BASE, message: `  ${BASE.message.toUpperCase()}  ` })).toBe(
      fingerprint(BASE),
    );
  });
});
