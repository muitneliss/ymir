import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { runQuery } from "../src/commands/query.js";
import { collectionName } from "../src/paths.js";

function tempWiki(): { projectDir: string; wikiRoot: string } {
  const projectDir = mkdtempSync(join(tmpdir(), "query-test-"));
  const wikiRoot = join(projectDir, "wiki");
  mkdirSync(wikiRoot, { recursive: true });
  return { projectDir, wikiRoot };
}

function recorder() {
  const calls: { cmd: string; args: string[] }[] = [];
  const runner = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return '[{"path":"wiki/notes/a.md","score":0.9}]';
  };
  return { calls, runner };
}

describe("runQuery", () => {
  it("invokes qmd search with json/files flags and returns stdout", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    const out = await runQuery({ root: wikiRoot, q: "rate limit", runner });
    expect(calls[0]!.cmd).toBe("qmd");
    expect(calls[0]!.args).toContain("search");
    expect(calls[0]!.args).toContain("rate limit");
    expect(calls[0]!.args).toContain("--json");
    expect(calls[0]!.args).toContain("--files");
    expect(out).toContain("wiki/notes/a.md");
  });

  it("scopes the search to this wiki's own qmd collection", async () => {
    const { projectDir, wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "rate limit", runner });

    const args = calls[0]!.args;
    const i = args.indexOf("-c");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe(`${basename(projectDir)}-wiki`);
  });

  it("uses the same collection name reindex registers", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "x", runner });

    const args = calls[0]!.args;
    expect(args[args.indexOf("-c") + 1]).toBe(collectionName(wikiRoot));
  });

  it("passes -n when a limit is given", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "x", limit: 25, runner });

    const args = calls[0]!.args;
    const i = args.indexOf("-n");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("25");
  });

  it("omits -n when no limit is given", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "x", runner });
    expect(calls[0]!.args).not.toContain("-n");
  });

  it("searches content terms, not the raw question", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "When did Melanie paint a sunrise?", runner });

    expect(calls[0]!.args).toContain("melanie paint sunrise");
    expect(calls[0]!.args).not.toContain("When did Melanie paint a sunrise?");
  });

  it("passes the query through untouched when verbatim is set", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "When did Melanie paint a sunrise?", verbatim: true, runner });

    expect(calls[0]!.args).toContain("When did Melanie paint a sunrise?");
  });

  it("returns chunk-level results when chunks is set", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    await runQuery({ root: wikiRoot, q: "x", chunks: true, runner });

    const args = calls[0]!.args;
    expect(args).not.toContain("--files");
    expect(args).toContain("--json");
  });
});
