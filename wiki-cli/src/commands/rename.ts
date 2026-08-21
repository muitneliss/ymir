import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { listPages, readPage, writePage } from "../store.js";
import { sourcePath, notePath, wikiPaths, slugify } from "../paths.js";
import { buildIndex } from "../index-build.js";
import { appendLog } from "../wikilog.js";
import { parseFrontmatter, stringifyFrontmatter } from "../frontmatter.js";
import { validateWiki } from "../validate.js";
import { reindex, type ReindexRunner } from "../reindex.js";
import { Rejection } from "../rejection.js";

export interface RenameInput {
  root: string;
  oldTitle: string;
  newTitle: string;
  today: string;
  noReindex?: boolean;
  preview?: boolean;
  reindexRunner?: ReindexRunner;
}

export interface RenameResult {
  oldPath: string;
  newPath: string;
  linksUpdated: number;
  affectedPaths: string[];
  renamed: boolean;
}

type SubDir = "sources" | "notes";

interface FoundPage {
  path: string;
  sub: SubDir;
}

function findPage(root: string, title: string): FoundPage | null {
  for (const sub of ["sources", "notes"] as SubDir[]) {
    const candidate = sub === "sources" ? sourcePath(root, title) : notePath(root, title);
    if (!existsSync(candidate)) continue;
    const fm = parseFrontmatter(readPage(candidate)).data as { title?: string };
    if (fm.title === title) return { path: candidate, sub };
  }
  return null;
}

function newPath(root: string, sub: SubDir, title: string): string {
  return sub === "sources" ? sourcePath(root, title) : notePath(root, title);
}

function rewriteLinks(content: string, oldSlug: string, newTitle: string): { updated: string; count: number } {
  let count = 0;
  const updated = content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    if (slugify(inner.trim()) === oldSlug) {
      count++;
      return `[[${newTitle}]]`;
    }
    return _match;
  });
  return { updated, count };
}

export async function runRename(i: RenameInput): Promise<RenameResult> {
  const found = findPage(i.root, i.oldTitle);
  if (!found) throw new Rejection(`rename rejected: "${i.oldTitle}" not found`);

  const targetPath = newPath(i.root, found.sub, i.newTitle);
  const newSlug = slugify(i.newTitle);
  const oldSlug = slugify(i.oldTitle);

  if (newSlug !== oldSlug && existsSync(targetPath)) {
    const existingTitle = (parseFrontmatter(readPage(targetPath)).data as { title?: string }).title;
    throw new Rejection(
      `rename rejected: slug collision — "${targetPath}" already holds "${existingTitle}"`,
    );
  }

  const oldSlugNorm = slugify(i.oldTitle);
  let linksUpdated = 0;
  const affectedPaths: string[] = [];

  for (const sub of ["sources", "notes"] as SubDir[]) {
    const dir = join(i.root, sub);
    for (const file of listPages(dir)) {
      const abs = join(dir, file);
      const { data, content } = parseFrontmatter(readPage(abs));
      const { count } = rewriteLinks(content, oldSlugNorm, i.newTitle);
      if (count > 0) {
        linksUpdated += count;
        affectedPaths.push(abs);
      }
    }
  }

  if (i.preview) return { oldPath: found.path, newPath: targetPath, linksUpdated, affectedPaths, renamed: false };

  const snapshots = new Map<string, string>();

  const applyLinkUpdates = (): void => {
    for (const sub of ["sources", "notes"] as SubDir[]) {
      const dir = join(i.root, sub);
      for (const file of listPages(dir)) {
        const abs = join(dir, file);
        const raw = readPage(abs);
        snapshots.set(abs, raw);
        const { data, content } = parseFrontmatter(raw);
        const { updated } = rewriteLinks(content, oldSlugNorm, i.newTitle);
        if (updated !== content) writePage(abs, stringifyFrontmatter(updated, data));
      }
    }
  };

  const restore = (): void => {
    for (const [abs, content] of snapshots) writePage(abs, content);
    if (existsSync(targetPath) && targetPath !== found.path) rmSync(targetPath);
  };

  applyLinkUpdates();

  const oldRaw = snapshots.get(found.path) ?? readPage(found.path);
  const { data: oldData, content: oldContent } = parseFrontmatter(oldRaw);
  const renamedData = { ...oldData, title: i.newTitle };
  const { updated: renamedContent } = rewriteLinks(oldContent, oldSlugNorm, i.newTitle);
  writePage(targetPath, stringifyFrontmatter(renamedContent, renamedData));

  if (found.path !== targetPath) rmSync(found.path);

  const result = validateWiki(i.root);
  if (!result.ok) {
    restore();
    throw new Rejection(`rename rejected:\n${result.errors.join("\n")}`);
  }

  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "rename", `${i.oldTitle} → ${i.newTitle}`, i.today);
  if (!i.noReindex) reindex(i.root, i.reindexRunner);

  return { oldPath: found.path, newPath: targetPath, linksUpdated, affectedPaths, renamed: true };
}
