import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { listPages, readPage, writePage } from "../store.js";
import { sourcePath, notePath, wikiPaths, slugify } from "../paths.js";
import { buildIndex } from "../index-build.js";
import { appendLog } from "../wikilog.js";
import { parseFrontmatter } from "../frontmatter.js";
import { reindex, type ReindexRunner } from "../reindex.js";

export interface InboundLink {
  from: string;
  link: string;
}

export interface RemoveInput {
  root: string;
  title: string;
  today: string;
  noReindex?: boolean;
  preview?: boolean;
  reindexRunner?: ReindexRunner;
}

export interface RemoveResult {
  path: string;
  inboundLinks: InboundLink[];
  removed: boolean;
}

function findPage(root: string, title: string): string | null {
  for (const sub of ["sources", "notes"] as const) {
    const candidate = sub === "sources" ? sourcePath(root, title) : notePath(root, title);
    if (!existsSync(candidate)) continue;
    const fm = parseFrontmatter(readPage(candidate)).data as { title?: string };
    if (fm.title === title) return candidate;
  }
  return null;
}

function scanInboundLinks(root: string, title: string, excludePath: string): InboundLink[] {
  const targetSlug = slugify(title);
  const results: InboundLink[] = [];
  for (const sub of ["sources", "notes"] as const) {
    const dir = join(root, sub);
    for (const file of listPages(dir)) {
      const abs = join(dir, file);
      if (abs === excludePath) continue;
      const { content } = parseFrontmatter(readPage(abs));
      const rel = `${sub}/${file}`;
      for (const m of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (slugify(m[1]!.trim()) === targetSlug) {
          results.push({ from: rel, link: `[[${m[1]!.trim()}]]` });
        }
      }
    }
  }
  return results;
}

export function runRemove(i: RemoveInput): RemoveResult {
  const path = findPage(i.root, i.title);
  if (!path) throw new Error(`remove rejected: "${i.title}" not found`);

  const inboundLinks = scanInboundLinks(i.root, i.title, path);

  if (i.preview) return { path, inboundLinks, removed: false };

  if (inboundLinks.length > 0) {
    const detail = inboundLinks.map((l) => `  ${l.from}: ${l.link}`).join("\n");
    throw new Error(`remove rejected: inbound link(s) would break — remove or update them first:\n${detail}`);
  }

  rmSync(path);

  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "remove", i.title, i.today);
  if (!i.noReindex) reindex(i.root, i.reindexRunner);

  return { path, inboundLinks, removed: true };
}
