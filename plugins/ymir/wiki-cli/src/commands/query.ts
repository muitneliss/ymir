import { spawn } from "node:child_process";
import { collectionName } from "../paths.js";

export type Runner = (cmd: string, args: string[]) => Promise<string>;

const defaultRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `qmd exited ${code}`)),
    );
  });

export interface QueryInput {
  root: string;
  q: string;
  /** Cap on results (qmd `-n`). Omitted → qmd's own default. */
  limit?: number;
  /** Return matching chunks instead of whole files (drops qmd `--files`). */
  chunks?: boolean;
  runner?: Runner;
}

export async function runQuery(i: QueryInput): Promise<string> {
  const run = i.runner ?? defaultRunner;
  const args = ["search", i.q, "--json", "-c", collectionName(i.root)];
  if (!i.chunks) args.push("--files");
  if (i.limit !== undefined) args.push("-n", String(i.limit));
  return run("qmd", args);
}
