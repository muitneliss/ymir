import { existsSync, rmSync } from "node:fs";
import matter from "gray-matter";
import { renderNotePage } from "../pages.js";
import { writePage, readPage } from "../store.js";
import { notePath, wikiPaths } from "../paths.js";
import { buildIndex } from "../index-build.js";
import { appendLog } from "../wikilog.js";
import { validateWiki } from "../validate.js";
import type { NoteTypeT } from "../schema.js";

export interface NoteInput {
  root: string; type: NoteTypeT; name: string; body: string; today: string;
}

export async function runNote(i: NoteInput): Promise<string> {
  const path = notePath(i.root, i.name);
  const existed = existsSync(path);
  const prevSourceCount = existed
    ? ((matter(readPage(path)).data as { source_count?: number }).source_count ?? 0)
    : 0;

  const page = await renderNotePage({
    name: i.name, type: i.type, date: i.today,
    tags: [], sourceCount: prevSourceCount, body: i.body,
  });
  const prev = existed ? readPage(path) : null;
  writePage(path, page);

  const result = validateWiki(i.root);
  if (!result.ok) {
    if (prev === null) rmSync(path);
    else writePage(path, prev);
    throw new Error(`note rejected:\n${result.errors.join("\n")}`);
  }

  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "note", i.name, i.today);
  return path;
}
