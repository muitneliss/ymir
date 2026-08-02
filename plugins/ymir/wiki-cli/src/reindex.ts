import { spawnSync } from "node:child_process";
import { collectionName } from "./paths.js";

export type ReindexRunner = (cmd: string, args: string[]) => { status: number | null };

/** How the index was brought up to date. */
export type ReindexMode = "created" | "updated" | "skipped";

export interface ReindexResult {
  ok: boolean;
  skipped: boolean;
  name: string;
  mode: ReindexMode;
}

const defaultRunner: ReindexRunner = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "pipe" });
  return { status: result.status };
};

/**
 * Bring this wiki's qmd collection up to date.
 *
 * `qmd collection add` only succeeds the FIRST time — on an existing collection
 * it exits non-zero with "Collection already exists" and indexes nothing. Using
 * it as the refresh path meant every write after the first was invisible to
 * `wiki query` forever. Re-indexing an existing collection is `qmd update`.
 */
export function reindex(root: string, runner: ReindexRunner = defaultRunner): ReindexResult {
  const name = collectionName(root);
  try {
    // Creates the collection and indexes it in one step, when it doesn't exist yet.
    const added = runner("qmd", ["collection", "add", root, "--name", name]);
    if (added.status === 0) return { ok: true, skipped: false, name, mode: "created" };

    // A null status means qmd could not be spawned at all — no point retrying.
    if (added.status === null) {
      process.stderr.write(`[wiki] reindex: qmd unavailable — skipping\n`);
      return { ok: false, skipped: true, name, mode: "skipped" };
    }

    // Non-zero almost always means "collection already exists" — refresh it.
    const updated = runner("qmd", ["update"]);
    if (updated.status === 0) return { ok: true, skipped: false, name, mode: "updated" };

    process.stderr.write(`[wiki] reindex: qmd update non-zero exit — skipping\n`);
    return { ok: false, skipped: true, name, mode: "skipped" };
  } catch {
    process.stderr.write(`[wiki] reindex: qmd error — skipping\n`);
    return { ok: false, skipped: true, name, mode: "skipped" };
  }
}
