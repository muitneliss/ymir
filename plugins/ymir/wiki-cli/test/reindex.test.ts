import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { reindex, COLLECTION_MASK, type ReindexRunner, type RunnerResult } from "../src/reindex.js";

function wikiDir(): { projectDir: string; wikiRoot: string } {
  const projectDir = mkdtempSync(join(tmpdir(), "reindex-test-"));
  const wikiRoot = join(projectDir, "wiki");
  mkdirSync(wikiRoot, { recursive: true });
  return { projectDir, wikiRoot };
}

interface Collection {
  path: string;
  mask: string;
}

/**
 * Simulator for the qmd behaviours reindex has to survive, all observed on
 * qmd 2.5.3:
 *  - `collection add` on an EXISTING NAME exits non-zero and indexes nothing;
 *  - `collection add` for an already-registered PATH exits ZERO and does
 *    nothing, even under a new name (collections are keyed by path);
 *  - `update` re-indexes everything.
 */
function fakeQmd(initial: Record<string, Collection> = {}) {
  const collections = new Map<string, Collection>(Object.entries(initial));
  const calls: string[][] = [];

  const runner: ReindexRunner = (_cmd, args): RunnerResult => {
    calls.push(args);
    const [a, b] = args;

    if (a === "update") return { status: 0, stdout: "All collections updated." };

    if (a === "collection" && b === "list") {
      const lines = [...collections.keys()].map((n) => `${n} (qmd://${n}/)\n  Files: 1`);
      return { status: 0, stdout: `Collections (${collections.size}):\n\n${lines.join("\n\n")}\n` };
    }

    if (a === "collection" && b === "show") {
      const c = collections.get(args[2]!);
      if (!c) return { status: 1, stdout: `Collection not found: ${args[2]}` };
      return { status: 0, stdout: `Collection: ${args[2]}\n  Path:     ${c.path}\n  Pattern:  ${c.mask}\n` };
    }

    if (a === "collection" && b === "remove") {
      collections.delete(args[2]!);
      return { status: 0, stdout: "removed" };
    }

    if (a === "collection" && b === "add") {
      const path = resolve(args[2]!);
      const name = args[args.indexOf("--name") + 1]!;
      const mask = args[args.indexOf("--mask") + 1] ?? "**/*.md";
      if (collections.has(name)) return { status: 1, stdout: "Collection already exists." };
      for (const c of collections.values()) {
        // The trap: exits 0, changes nothing.
        if (resolve(c.path) === path) return { status: 0, stdout: "Use 'qmd update' to re-index it" };
      }
      collections.set(name, { path, mask });
      return { status: 0, stdout: "Indexed: 11 new" };
    }

    return { status: 1, stdout: "" };
  };

  return { runner, calls, collections };
}

describe("reindex", () => {
  it("creates the collection with the curated-only mask", () => {
    const { projectDir, wikiRoot } = wikiDir();
    const { runner, collections } = fakeQmd();

    const r = reindex(wikiRoot, runner);
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("created");
    expect(r.name).toBe(`${basename(projectDir)}-wiki`);
    expect(collections.get(r.name)?.mask).toBe(COLLECTION_MASK);
  });

  it("never indexes raw/", () => {
    expect(COLLECTION_MASK).not.toContain("raw");
    expect(COLLECTION_MASK).toContain("sources");
    expect(COLLECTION_MASK).toContain("notes");
  });

  it("updates an existing, correctly-masked collection", () => {
    const { projectDir, wikiRoot } = wikiDir();
    const name = `${basename(projectDir)}-wiki`;
    const { runner, calls } = fakeQmd({ [name]: { path: wikiRoot, mask: COLLECTION_MASK } });

    const r = reindex(wikiRoot, runner);
    expect(r.mode).toBe("updated");
    expect(calls.some((c) => c[0] === "update")).toBe(true);
  });

  it("re-creates a collection that predates the mask", () => {
    const { projectDir, wikiRoot } = wikiDir();
    const name = `${basename(projectDir)}-wiki`;
    const { runner, collections } = fakeQmd({ [name]: { path: wikiRoot, mask: "**/*.md" } });

    const r = reindex(wikiRoot, runner);
    expect(r.mode).toBe("remasked");
    expect(collections.get(name)?.mask).toBe(COLLECTION_MASK);
  });

  it("evicts a differently-named collection squatting the same path", () => {
    // qmd keys by path, so `add` would exit 0 and silently do nothing here.
    const { wikiRoot } = wikiDir();
    const { runner, collections } = fakeQmd({ masktest: { path: wikiRoot, mask: "**/*.md" } });

    const r = reindex(wikiRoot, runner);
    expect(r.ok).toBe(true);
    expect(collections.has("masktest")).toBe(false);
    expect(collections.get(r.name)?.mask).toBe(COLLECTION_MASK);
  });

  it("leaves collections for other paths alone", () => {
    const { wikiRoot } = wikiDir();
    const other = wikiDir().wikiRoot;
    const { runner, collections } = fakeQmd({ other: { path: other, mask: "**/*.md" } });

    reindex(wikiRoot, runner);
    expect(collections.has("other")).toBe(true);
  });

  it("skips when qmd cannot be spawned", () => {
    const { wikiRoot } = wikiDir();
    const runner: ReindexRunner = () => ({ status: null, stdout: "" });

    const r = reindex(wikiRoot, runner);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.mode).toBe("skipped");
  });

  it("skips when the runner throws", () => {
    const { wikiRoot } = wikiDir();
    const runner: ReindexRunner = () => {
      throw new Error("qmd not found");
    };
    expect(() => reindex(wikiRoot, runner)).not.toThrow();
    expect(reindex(wikiRoot, runner).skipped).toBe(true);
  });

  it("reports skipped when the collection still does not exist after add", () => {
    const { wikiRoot } = wikiDir();
    // add claims success but registers nothing — the silent no-op.
    const runner: ReindexRunner = (_cmd, args) => {
      if (args[1] === "list") return { status: 0, stdout: "Collections (0):\n" };
      if (args[1] === "show") return { status: 1, stdout: "Collection not found" };
      return { status: 0, stdout: "Use 'qmd update' to re-index it" };
    };

    const r = reindex(wikiRoot, runner);
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("skipped");
  });
});
