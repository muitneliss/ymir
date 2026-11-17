import { basename, join, resolve } from "node:path";

/**
 * The qmd collection this wiki is registered under. `reindex` registers it and
 * `query` searches it — both must derive the name here so a search can never
 * leak into another project's collection.
 */
export function collectionName(root: string): string {
  return `${basename(resolve(root, ".."))}-wiki`;
}

// Letters NFD cannot split into a base letter plus a combining mark.
const TRANSLITERATE: Record<string, string> = {
  "đ": "d", "Đ": "d", "ð": "d", "ł": "l", "Ł": "l", "ø": "o", "Ø": "o",
  "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ß": "ss", "þ": "th", "Þ": "th",
};

/**
 * Page file name stem for a title. Accented letters keep their base letter
 * ("Bản đồ" → "ban-do"), so a non-English title still yields a readable name.
 */
export function slugify(input: string): string {
  return legacySlugify(
    input
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .replace(/[đĐðłŁøØæÆœŒßþÞ]/g, (ch) => TRANSLITERATE[ch] ?? ch),
  );
}

/**
 * The slug before 0.9.3, which dropped every non-ASCII letter ("Bản đồ" →
 * "b-n"). Kept only to recognise and rename files written under it.
 */
export function legacySlugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function wikiPaths(root: string) {
  return {
    root,
    index: join(root, "index.md"),
    log: join(root, "log.md"),
    schema: join(root, "SCHEMA.md"),
    rawDir: join(root, "raw"),
    sourcesDir: join(root, "sources"),
    notesDir: join(root, "notes"),
  };
}

export function sourcePath(root: string, title: string): string {
  return join(root, "sources", `${slugify(title)}.md`);
}

export function notePath(root: string, name: string): string {
  return join(root, "notes", `${slugify(name)}.md`);
}
