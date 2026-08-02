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
  it("invokes qmd search as JSON and returns stdout", async () => {
    const { wikiRoot } = tempWiki();
    const { calls, runner } = recorder();
    const out = await runQuery({ root: wikiRoot, q: "rate limit", runner });
    expect(calls[0]!.cmd).toBe("qmd");
    expect(calls[0]!.args).toContain("search");
    expect(calls[0]!.args).toContain("rate limit");
    expect(calls[0]!.args).toContain("--json");
    // qmd lets --files override --json and emit CSV, so we must never send it;
    // file-level results are produced by collapsing chunks ourselves.
    expect(calls[0]!.args).not.toContain("--files");
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

describe("runQuery coordination merge", () => {
  /**
   * Per-term canned responses, keyed by the exact query string qmd would see.
   * Lets a test control each single-term probe's hits independently — the
   * conjunctive corpusRunner above can't express "these two terms individually
   * match different, overlapping sets of documents".
   */
  function scriptedRunner(responses: Record<string, unknown[]>) {
    const calls: string[] = [];
    const runner = async (_cmd: string, args: string[]) => {
      const q = args[1]!;
      calls.push(q);
      return JSON.stringify(responses[q] ?? []);
    };
    return { calls, runner };
  }

  it("ranks a document matching more surviving terms above one matching fewer", async () => {
    const { wikiRoot } = tempWiki();
    // Neither the full query nor any absent-term retry matches anything, so
    // this exercises the merge of the three single-term probes below.
    const { calls, runner } = scriptedRunner({
      "alpha beta gamma": [],
      alpha: [
        { docid: "#a1", score: 0.5, file: "sources/a.md" },
        { docid: "#b1", score: 0.9, file: "sources/b.md" },
      ],
      beta: [{ docid: "#a2", score: 0.6, file: "sources/a.md" }],
      gamma: [{ docid: "#c1", score: 0.99, file: "sources/c.md" }],
    });

    const out = await runQuery({ root: wikiRoot, q: "alpha beta gamma", runner });
    const hits = JSON.parse(out) as { file: string }[];

    // sources/a.md matches two of the three surviving terms (alpha, beta);
    // sources/b.md and sources/c.md each match only one. Coordination level
    // must win over sources/c.md's higher single-term score. (a.md contributes
    // two chunk hits, one per matching term — mirroring real chunk-mode qmd
    // output, which callers dedupe to unique pages themselves.)
    expect(hits[0]!.file).toBe("sources/a.md");
    const uniqueFilesInOrder = [...new Set(hits.map((h) => h.file))];
    expect(uniqueFilesInOrder).toEqual(["sources/a.md", "sources/c.md", "sources/b.md"]);

    // The merge must be free: no qmd calls beyond the full query plus one
    // probe per surviving term (no combinatorial subset probing).
    expect(calls).toEqual(["alpha beta gamma", "alpha", "beta", "gamma"]);
  });

  it("de-duplicates a document that appears under multiple terms into one entry", async () => {
    const { wikiRoot } = tempWiki();
    const { runner } = scriptedRunner({
      "alpha beta": [],
      alpha: [{ docid: "#same", score: 0.5, file: "sources/a.md" }],
      beta: [{ docid: "#same", score: 0.5, file: "sources/a.md" }],
    });

    const out = await runQuery({ root: wikiRoot, q: "alpha beta", runner });
    const hits = JSON.parse(out) as { file: string }[];
    expect(hits).toHaveLength(1);
    expect(hits[0]!.file).toBe("sources/a.md");
  });

  it("respects limit when merging", async () => {
    const { wikiRoot } = tempWiki();
    const { runner } = scriptedRunner({
      "alpha beta": [],
      alpha: [
        { docid: "#a", score: 0.9, file: "sources/a.md" },
        { docid: "#b", score: 0.8, file: "sources/b.md" },
      ],
      beta: [{ docid: "#c", score: 0.7, file: "sources/c.md" }],
    });

    const out = await runQuery({ root: wikiRoot, q: "alpha beta", limit: 1, runner });
    const hits = JSON.parse(out) as { file: string }[];
    expect(hits).toHaveLength(1);
  });
});

describe("runQuery resilience", () => {
  it("survives a flaky probe instead of failing the whole query", async () => {
    const { wikiRoot } = tempWiki();
    // qmd intermittently exits non-zero under concurrent access; one bad probe
    // must not take down a query that would otherwise succeed.
    const runner = async (_cmd: string, args: string[]) => {
      const q = args[1]!;
      if (q === "flaky") throw new Error("qmd exited 1");
      if (q.includes(" ")) return "[]";
      return JSON.stringify([{ docid: "#1", score: 1, file: "sources/a.md" }]);
    };

    const out = await runQuery({ root: wikiRoot, q: "What about the flaky hook?", runner });
    expect(hitCount(out)).toBeGreaterThan(0);
  });

  it("probes sequentially, never concurrently", async () => {
    const { wikiRoot } = tempWiki();
    let inFlight = 0;
    let maxInFlight = 0;
    const runner = async (_cmd: string, args: string[]) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return args[1]!.includes(" ") ? "[]" : JSON.stringify([{ docid: "#1", file: "sources/a.md" }]);
    };

    await runQuery({ root: wikiRoot, q: "alpha beta gamma delta", runner });
    expect(maxInFlight).toBe(1);
  });

  it("still raises when qmd is genuinely unavailable", async () => {
    const { wikiRoot } = tempWiki();
    const runner = async () => {
      throw new Error("qmd not found");
    };
    await expect(runQuery({ root: wikiRoot, q: "alpha beta gamma", runner })).rejects.toThrow(
      "qmd not found",
    );
  });

  it("de-duplicates repeated terms", async () => {
    const { wikiRoot } = tempWiki();
    const calls: string[] = [];
    const runner = async (_cmd: string, args: string[]) => {
      calls.push(args[1]!);
      return "[]";
    };
    // "index.md ... log.md" yields "md" twice before de-duplication.
    await runQuery({ root: wikiRoot, q: "edits to index.md and log.md", runner });
    expect(calls[0]!.split(" ").filter((t) => t === "md")).toHaveLength(1);
  });
});

describe("runQuery default (file-level) output", () => {
  const chunkJson = JSON.stringify([
    { docid: "#1", score: 0.9, file: "qmd://w/sources/a.md", snippet: "x" },
    { docid: "#2", score: 0.8, file: "qmd://w/sources/a.md", snippet: "y" },
    { docid: "#3", score: 0.7, file: "qmd://w/notes/b.md", snippet: "z" },
  ]);

  it("never passes --files, which would override --json and emit CSV", async () => {
    const { wikiRoot } = tempWiki();
    const calls: string[][] = [];
    const runner = async (_cmd: string, args: string[]) => {
      calls.push(args);
      return chunkJson;
    };

    await runQuery({ root: wikiRoot, q: "hook", runner });
    expect(calls.every((a) => !a.includes("--files"))).toBe(true);
  });

  it("returns parseable JSON with one entry per file", async () => {
    const { wikiRoot } = tempWiki();
    const runner = async () => chunkJson;

    const out = await runQuery({ root: wikiRoot, q: "hook", runner });
    const parsed = JSON.parse(out);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((h: { file: string }) => h.file)).toEqual([
      "qmd://w/sources/a.md",
      "qmd://w/notes/b.md",
    ]);
  });

  it("keeps every chunk when --chunks is set", async () => {
    const { wikiRoot } = tempWiki();
    const runner = async () => chunkJson;

    const out = await runQuery({ root: wikiRoot, q: "hook", chunks: true, runner });
    expect(JSON.parse(out)).toHaveLength(3);
  });

  it("hitCount reads the default path, so backoff is not falsely triggered", async () => {
    const { wikiRoot } = tempWiki();
    const calls: string[][] = [];
    const runner = async (_cmd: string, args: string[]) => {
      calls.push(args);
      return chunkJson;
    };

    await runQuery({ root: wikiRoot, q: "the hook that blocks edits", runner });
    // One call only: the first query found hits, so no per-term probing.
    expect(calls).toHaveLength(1);
  });
});

describe("runQuery --full", () => {
  it("asks qmd for whole page bodies when full is set", async () => {
    const { wikiRoot } = tempWiki();
    const calls: string[][] = [];
    const runner = async (_cmd: string, args: string[]) => {
      calls.push(args);
      return JSON.stringify([{ docid: "#1", file: "sources/a.md", body: "whole page" }]);
    };

    await runQuery({ root: wikiRoot, q: "hook", full: true, runner });
    expect(calls[0]).toContain("--full");
  });

  it("does not ask for full bodies by default", async () => {
    const { wikiRoot } = tempWiki();
    const calls: string[][] = [];
    const runner = async (_cmd: string, args: string[]) => {
      calls.push(args);
      return JSON.stringify([{ docid: "#1", file: "sources/a.md", snippet: "s" }]);
    };

    await runQuery({ root: wikiRoot, q: "hook", runner });
    expect(calls[0]).not.toContain("--full");
  });
});
