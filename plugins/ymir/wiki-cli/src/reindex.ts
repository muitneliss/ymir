import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

export type ReindexRunner = (cmd: string, args: string[]) => { status: number | null };

export interface ReindexResult {
  ok: boolean;
  skipped: boolean;
  name: string;
}

const defaultRunner: ReindexRunner = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "pipe" });
  return { status: result.status };
};

export function reindex(root: string, runner: ReindexRunner = defaultRunner): ReindexResult {
  const name = `${basename(resolve(root, ".."))}-wiki`;
  try {
    const r = runner("qmd", ["collection", "add", root, "--name", name]);
    if (r.status === 0) return { ok: true, skipped: false, name };
    process.stderr.write(`[wiki] reindex: qmd non-zero exit — skipping\n`);
    return { ok: false, skipped: true, name };
  } catch {
    process.stderr.write(`[wiki] reindex: qmd error — skipping\n`);
    return { ok: false, skipped: true, name };
  }
}
