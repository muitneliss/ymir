import { basename, join, resolve } from "node:path";

/**
 * The qmd collection this wiki is registered under. `reindex` registers it and
 * `query` searches it — both must derive the name here so a search can never
 * leak into another project's collection.
 */
export function collectionName(root: string): string {
  return `${basename(resolve(root, ".."))}-wiki`;
}

export function slugify(input: string): string {
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
