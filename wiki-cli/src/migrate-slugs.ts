import { existsSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { listPages, readPage } from "./store.js";
import { legacySlugify, slugify } from "./paths.js";

export interface SlugRename {
  from: string;
  to: string;
}

function titleOf(path: string): string | undefined {
  try {
    const title = (parseFrontmatter(readPage(path)).data as { title?: unknown }).title;
    return typeof title === "string" ? title : undefined;
  } catch {
    return undefined; // `validate` reports a page it cannot parse; renaming is not its fix.
  }
}

/**
 * Where a page with this title was written before 0.9.3, when that differs from
 * `path`, the name today's slug gives it. Only a file that is exactly the old
 * slug of its own title counts, so nothing else is ever moved.
 */
export function legacyPagePath(path: string, title: string): string | null {
  const legacy = join(dirname(path), `${legacySlugify(title)}.md`);
  if (legacy === path || !existsSync(legacy) || titleOf(legacy) !== title) return null;
  return legacy;
}

/** Move this title's page from its old-slug name to `path`, if it has one and `path` is free. */
export function adoptLegacyFile(path: string, title: string): void {
  if (existsSync(path)) return;
  const legacy = legacyPagePath(path, title);
  if (legacy !== null) renameSync(legacy, path);
}

/** Rename every page still named by the pre-0.9.3 slug. Run by `wiki index`. */
export function migrateLegacyFilenames(root: string): SlugRename[] {
  const renamed: SlugRename[] = [];
  for (const sub of ["sources", "notes"]) {
    const dir = join(root, sub);
    for (const file of listPages(dir)) {
      const title = titleOf(join(dir, file));
      if (title === undefined) continue;
      const target = join(dir, `${slugify(title)}.md`);
      if (legacyPagePath(target, title) !== join(dir, file) || existsSync(target)) continue;
      renameSync(join(dir, file), target);
      renamed.push({ from: `${sub}/${file}`, to: `${sub}/${basename(target)}` });
    }
  }
  return renamed;
}
