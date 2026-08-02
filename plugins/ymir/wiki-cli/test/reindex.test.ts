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

  it("falls back to `qmd update` when the collection already exists", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const calls: string[][] = [];
    // `collection add` exits non-zero on an existing collection; `update` succeeds.
    const runner: ReindexRunner = (_cmd, args) => {
      calls.push(args);
      return { status: args[0] === "update" ? 0 : 1 };
    };

    const result = reindex(wikiRoot, runner);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.mode).toBe("updated");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(["update"]);
  });

  it("reports mode=created when the collection is new", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const calls: string[][] = [];
    const runner: ReindexRunner = (_cmd, args) => {
      calls.push(args);
      return { status: 0 };
    };

    const result = reindex(wikiRoot, runner);
    expect(result.mode).toBe("created");
    // No pointless `update` when `collection add` already indexed the files.
    expect(calls).toHaveLength(1);
  });

  it("returns skipped when both add and update fail", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const runner: ReindexRunner = () => ({ status: 1 });
    const result = reindex(wikiRoot, runner);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.mode).toBe("skipped");
  });

  it("does not attempt update when qmd cannot be spawned", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
    const wikiRoot = join(projectDir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });

    const calls: string[][] = [];
    const runner: ReindexRunner = (_cmd, args) => {
      calls.push(args);
      return { status: null };
    };

    const result = reindex(wikiRoot, runner);
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(1);
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
