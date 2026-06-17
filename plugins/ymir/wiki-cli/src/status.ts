import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { listPages, readPage } from "./store.js";
import { parseFrontmatter } from "./frontmatter.js";
import { hashFile } from "./hash.js";
import { slugify } from "./paths.js";

export type SourceState = "current" | "stale" | "missing" | "untracked";

export interface SourceStatus {
  title: string;
  rel: string;
  source_path?: string;
  state: SourceState;
}

export interface NoteStatus {
  title: string;
  rel: string;
}

export interface StatusReport {
  sources: SourceStatus[];
  review: NoteStatus[];
}

export function computeStatus(root: string): StatusReport {
  const projectRoot = resolve(root, "..");
  const sourcesDir = join(root, "sources");
  const notesDir = join(root, "notes");

  const sourceFiles = listPages(sourcesDir);
  const sources: SourceStatus[] = [];
  const staleOrMissingSlugs = new Set<string>();

  for (const file of sourceFiles) {
    const rel = `sources/${file}`;
    const content = readPage(join(sourcesDir, file));
    const { data } = parseFrontmatter(content);
    const title = ((data as { title?: string }).title ?? file.replace(/\.md$/, ""));
    const source_path = (data as { source_path?: string }).source_path;
    const source_hash = (data as { source_hash?: string }).source_hash;

    let state: SourceState;
    if (!source_hash) {
      state = "untracked";
    } else {
      const absPath = source_path ? join(projectRoot, source_path) : undefined;
      if (!absPath || !existsSync(absPath)) {
        state = "missing";
        staleOrMissingSlugs.add(slugify(title));
      } else {
        const currentHash = hashFile(absPath);
        if (currentHash !== source_hash) {
          state = "stale";
          staleOrMissingSlugs.add(slugify(title));
        } else {
          state = "current";
        }
      }
    }

    sources.push({ title, rel, source_path, state });
  }

  const noteFiles = listPages(notesDir);
  const review: NoteStatus[] = [];

  for (const file of noteFiles) {
    const rel = `notes/${file}`;
    const content = readPage(join(notesDir, file));
    const { data, content: body } = parseFrontmatter(content);
    const title = ((data as { title?: string }).title ?? file.replace(/\.md$/, ""));
    const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
    const linksStale = links.some((link) => staleOrMissingSlugs.has(slugify(link)));
    if (linksStale) {
      review.push({ title, rel });
    }
  }

  return { sources, review };
}

export function hasDrift(r: StatusReport): boolean {
  return r.sources.some((s) => s.state === "stale" || s.state === "missing");
}
