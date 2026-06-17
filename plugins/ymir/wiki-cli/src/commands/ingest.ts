import { existsSync, rmSync } from "node:fs";
import { renderSourcePage } from "../pages.js";
import { writePage, readPage } from "../store.js";
import { sourcePath, wikiPaths } from "../paths.js";
import { buildIndex } from "../index-build.js";
import { appendLog } from "../wikilog.js";
import { validateWiki } from "../validate.js";
import { reindex, type ReindexRunner } from "../reindex.js";

export interface IngestInput {
  root: string;
  raw: string;
  title: string;
  body: string;
  today: string;
  sourcePath?: string;
  sourceHash?: string;
  noReindex?: boolean;
  reindexRunner?: ReindexRunner;
}

export async function runIngest(i: IngestInput): Promise<string> {
  const page = await renderSourcePage({
    title: i.title,
    source: i.raw,
    date: i.today,
    tags: [],
    body: i.body,
    sourcePath: i.sourcePath,
    sourceHash: i.sourceHash,
  });
  const path = sourcePath(i.root, i.title);
  const prev = existsSync(path) ? readPage(path) : null;
  writePage(path, page);

  const result = validateWiki(i.root);
  if (!result.ok) {
    if (prev === null) rmSync(path);
    else writePage(path, prev);
    throw new Error(`ingest rejected:\n${result.errors.join("\n")}`);
  }

  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "ingest", i.title, i.today);
  if (!i.noReindex) reindex(i.root, i.reindexRunner);
  return path;
}
