import { describe, it, expect } from "bun:test";
import {
  CLAUDE_BLOCK, claudeBlockPresent, appendClaudeBlock,
} from "../src/scaffold.js";

describe("CLAUDE_BLOCK", () => {
  it("starts with the marker heading", () => {
    expect(CLAUDE_BLOCK.startsWith("## Wiki / Context")).toBe(true);
  });
});

describe("claudeBlockPresent", () => {
  it("false on empty", () => {
    expect(claudeBlockPresent("")).toBe(false);
  });
  it("false when marker absent", () => {
    expect(claudeBlockPresent("# Hello\nsome text")).toBe(false);
  });
  it("true when marker present", () => {
    expect(claudeBlockPresent("# Hi\n\n## Wiki / Context\nbody")).toBe(true);
  });
});

describe("appendClaudeBlock", () => {
  it("creates from empty", () => {
    const out = appendClaudeBlock("");
    expect(out).toBe(CLAUDE_BLOCK);
  });
  it("appends with blank-line separator when missing", () => {
    const out = appendClaudeBlock("# Project\nstuff\n");
    expect(out.endsWith(CLAUDE_BLOCK)).toBe(true);
    expect(out).toContain("# Project\nstuff\n\n## Wiki / Context");
  });
  it("does not double-append", () => {
    const once = appendClaudeBlock("# P\n");
    const twice = appendClaudeBlock(once);
    expect(twice).toBe(once);
  });
});
