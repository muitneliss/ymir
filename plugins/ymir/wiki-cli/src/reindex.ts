import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { collectionName } from "./paths.js";

export interface RunnerResult {
  status: number | null;
  stdout: string;
}

export type ReindexRunner = (cmd: string, args: string[]) => RunnerResult;

/** How the index was brought up to date. */
export type ReindexMode = "created" | "updated" | "remasked" | "skipped";

export interface ReindexResult {
  ok: boolean;
  skipped: boolean;
  name: string;
  mode: ReindexMode;
}

/**
 * Only the curated layer is searchable.
 *
 * qmd's default mask is `**\/*.md`, which indexes `raw/` too — the immutable
 * originals that `sources/` pages are summaries OF. Those originals are longer
 * and share the summary's vocabulary, so they outrank it: measured on this
 * repo's own wiki, a raw page was the top hit for 21 of 25 wrong answers. The
 * wiki's whole value is the curated layer, so that is what search must see.
 */
export const COLLECTION_MASK = "{sources,notes}/**/*.md";

const defaultRunner: ReindexRunner = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  return { status: result.status, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

/**
 * Bring this wiki's qmd collection up to date.
 *
 * `qmd collection add` only succeeds the FIRST time — on an existing collection
 * it exits non-zero with "Collection already exists" and indexes nothing. Using
 * it as the refresh path meant every write after the first was invisible to
 * `wiki query` forever. Re-indexing an existing collection is `qmd update`.
 */
/** Names of every collection qmd currently has registered. */
function listCollections(runner: ReindexRunner): string[] {
  const r = runner("qmd", ["collection", "list"]);
  if (r.status !== 0) return [];
  return [...r.stdout.matchAll(/^([A-Za-z0-9_.-]+) \(qmd:\/\//gm)].map((m) => m[1]!);
}

/** The indexed path of a collection, or null if it does not exist. */
function collectionPath(runner: ReindexRunner, name: string): string | null {
  const r = runner("qmd", ["collection", "show", name]);
  if (r.status !== 0) return null;
  const m = r.stdout.match(/^\s*Path:\s*(.+)$/m);
  return m ? m[1]!.trim() : null;
}

function hasMask(runner: ReindexRunner, name: string): boolean {
  const r = runner("qmd", ["collection", "show", name]);
  return r.status === 0 && r.stdout.includes(COLLECTION_MASK);
}

/**
 * Bring this wiki's qmd collection up to date.
 *
 * Exit codes from `qmd collection add` cannot be trusted, in two distinct ways:
 *   - on an existing collection it exits NON-ZERO and indexes nothing, so using
 *     it as the refresh path left every write after the first invisible to
 *     `wiki query` forever (the refresh path is `qmd update`);
 *   - qmd keys collections by PATH, not by name, so adding a second name for an
 *     already-registered directory exits ZERO while doing nothing at all.
 *
 * So this reconciles observed state instead: find whoever owns this path, make
 * it be us, with the right mask.
 */
export function reindex(root: string, runner: ReindexRunner = defaultRunner): ReindexResult {
  const name = collectionName(root);
  const target = resolve(root);
  const add = (): RunnerResult =>
    runner("qmd", ["collection", "add", root, "--name", name, "--mask", COLLECTION_MASK]);
  const remove = (n: string): RunnerResult => runner("qmd", ["collection", "remove", n]);

  try {
    const names = listCollections(runner);
    if (names.length === 0 && collectionPath(runner, name) === null) {
      // Either qmd is unavailable or nothing is registered yet; try to create.
      const created = add();
      if (created.status === null) {
        process.stderr.write(`[wiki] reindex: qmd unavailable — skipping\n`);
        return { ok: false, skipped: true, name, mode: "skipped" };
      }
      if (collectionPath(runner, name) !== null) {
        return { ok: true, skipped: false, name, mode: "created" };
      }
      process.stderr.write(`[wiki] reindex: collection not created — skipping\n`);
      return { ok: false, skipped: true, name, mode: "skipped" };
    }

    // Any collection already indexing this directory blocks us — including one
    // under a different name, which `add` would silently refuse.
    const squatters = names.filter((n) => {
      const p = collectionPath(runner, n);
      return p !== null && resolve(p) === target;
    });

    const ours = squatters.includes(name);
    if (ours && hasMask(runner, name) && squatters.length === 1) {
      const updated = runner("qmd", ["update"]);
      if (updated.status === 0) return { ok: true, skipped: false, name, mode: "updated" };
      process.stderr.write(`[wiki] reindex: qmd update non-zero exit — skipping\n`);
      return { ok: false, skipped: true, name, mode: "skipped" };
    }

    // Wrong name, wrong mask, or duplicates: clear them out and re-register.
    for (const n of squatters) remove(n);
    add();
    if (collectionPath(runner, name) !== null) {
      return { ok: true, skipped: false, name, mode: squatters.length ? "remasked" : "created" };
    }

    process.stderr.write(`[wiki] reindex: could not register collection — skipping\n`);
    return { ok: false, skipped: true, name, mode: "skipped" };
  } catch {
    process.stderr.write(`[wiki] reindex: qmd error — skipping\n`);
    return { ok: false, skipped: true, name, mode: "skipped" };
  }
}
