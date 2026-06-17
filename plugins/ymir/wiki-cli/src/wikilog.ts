import { appendFileLine } from "./store.js";
import { wikiPaths } from "./paths.js";

export type LogOp = "ingest" | "note" | "index" | "query" | "lint";

export function appendLog(root: string, op: LogOp, title: string, date: string): void {
  appendFileLine(wikiPaths(root).log, `## [${date}] ${op} | ${title}`);
}
