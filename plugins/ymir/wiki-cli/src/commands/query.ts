import { spawn } from "node:child_process";

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
  runner?: Runner;
}

export async function runQuery(i: QueryInput): Promise<string> {
  const run = i.runner ?? defaultRunner;
  return run("qmd", ["query", i.q, "--json", "--files"]);
}
