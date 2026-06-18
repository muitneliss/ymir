import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { reindex, type ReindexRunner } from "../src/reindex.js";

describe("reindex", () => {
  it("calls qmd collection add with correct args", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const calls: { cmd: string; args: string[] }[] = [];
    const runner: ReindexRunner = (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0 };
    };

    const result = reindex(wikiRoot, runner);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("qmd");
    expect(calls[0]?.args[0]).toBe("collection");
    expect(calls[0]?.args[1]).toBe("add");
    expect(calls[0]?.args[2]).toBe(wikiRoot);
    expect(calls[0]?.args[3]).toBe("--name");
    expect(calls[0]?.args[4]).toBe(`${basename(projectDir)}-wiki`);
  });

  it("returns skipped when runner returns non-zero", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const runner: ReindexRunner = () => ({ status: 1 });
    const result = reindex(wikiRoot, runner);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("returns skipped when runner throws", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const runner: ReindexRunner = () => { throw new Error("qmd not found"); };
    expect(() => reindex(wikiRoot, runner)).not.toThrow();
    const result = reindex(wikiRoot, runner);
    expect(result.skipped).toBe(true);
  });
});
