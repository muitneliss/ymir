import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { runQuery, hitCount } from "../src/commands/query.js";
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

describe("runQuery conjunctive backoff", () => {
  /** Fake qmd: a doc matches only if it contains EVERY query term (conjunctive). */
  function corpusRunner(docs: string[][]) {
    const calls: string[] = [];
    const runner = async (_cmd: string, args: string[]) => {
      const q = args[1]!;
      calls.push(q);
      const terms = q.split(/\s+/).filter(Boolean);
      const hits = docs.filter((d) => terms.every((t) => d.includes(t)));
      return JSON.stringify(hits.map((d, i) => ({ docid: `#${i}`, score: 1, file: d[0] })));
    };
    return { calls, runner };
  }

  it("drops a term the index does not contain", async () => {
    const { wikiRoot } = tempWiki();
    // "happens" appears in no document, so a conjunctive engine returns nothing.
    const { calls, runner } = corpusRunner([["hook", "binary", "download"]]);

    const out = await runQuery({ root: wikiRoot, q: "What happens when the hook download binary?", runner });

    expect(hitCount(out)).toBeGreaterThan(0);
    expect(calls[0]).toContain("happens");
    expect(calls[calls.length - 1]).not.toContain("happens");
  });

  it("does not probe when the full query already matches", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = corpusRunner([["hook", "binary"]]);

    await runQuery({ root: wikiRoot, q: "hook binary", runner });
    expect(calls).toHaveLength(1);
  });

  it("backs off to rarer terms when survivors do not co-occur", async () => {
    const { wikiRoot } = tempWiki();
    // "alpha" and "omega" both exist, but never together.
    const { runner } = corpusRunner([
      ["alpha", "common"],
      ["omega", "common", "common2", "common3"],
    ]);

    const out = await runQuery({ root: wikiRoot, q: "alpha omega", runner });
    expect(hitCount(out)).toBeGreaterThan(0);
  });

  it("returns the original result when no term is in the index", async () => {
    const { wikiRoot } = tempWiki();
    const { runner } = corpusRunner([["totally", "unrelated"]]);

    const out = await runQuery({ root: wikiRoot, q: "absent missing gone", runner });
    expect(hitCount(out)).toBe(0);
  });

  it("verbatim skips extraction and backoff entirely", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = corpusRunner([["hook"]]);

    await runQuery({ root: wikiRoot, q: "What happens to the hook?", verbatim: true, runner });
    expect(calls).toEqual(["What happens to the hook?"]);
  });
});
