import { join, basename } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { parseFrontmatter } from "./frontmatter.js";
import { listPages, readPage } from "./store.js";
import { sourceFrontmatter, noteFrontmatter } from "./schema.js";
import { slugify } from "./paths.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

interface Page { rel: string; title: string; body: string; links: string[]; }

function nestedMarkdownPaths(dir: string, relPrefix: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    walkDir(join(dir, entry.name), `${relPrefix}/${entry.name}`, found);
  }
  return found;
}

function walkDir(dir: string, relPrefix: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walkDir(join(dir, entry.name), rel, acc);
    } else if (entry.name.endsWith(".md")) {
      acc.push(rel);
    }
  }
}

function loadDir(root: string, sub: string, errors: string[]): Page[] {
  const out: Page[] = [];
  for (const file of listPages(join(root, sub))) {
    const rel = `${sub}/${file}`;
    const parsed = parseFrontmatter(readPage(join(root, sub, file)));
    const schema = sub === "sources" ? sourceFrontmatter : noteFrontmatter;
    const res = schema.safeParse(parsed.data);
    if (!res.success) {
      errors.push(`${rel}: invalid frontmatter — ${res.error.issues.map((i) => i.message).join("; ")}`);
    }
    const title = (parsed.data as { title?: string }).title ?? file.replace(/\.md$/, "");
    const links = [...parsed.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
    out.push({ rel, title, body: parsed.content, links });
  }
  return out;
}

export function validateWiki(root: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const sub of ["sources", "notes"]) {
    for (const rel of nestedMarkdownPaths(join(root, sub), sub)) {
      errors.push(`${rel}: nested page not supported — move to ${sub}/ root or remove`);
    }
  }

  const sources = loadDir(root, "sources", errors);
  const notes = loadDir(root, "notes", errors);
  const all = [...sources, ...notes];

  for (const p of all) {
    const filename = basename(p.rel);
    const expected = `${slugify(p.title)}.md`;
    if (filename !== expected) {
      errors.push(`${p.rel}: filename "${filename}" does not match title "${p.title}" (expected "${expected}") — rename the file or update the title`);
    }
  }

  const slugMap = new Map<string, string[]>();
  for (const p of all) {
    const slug = slugify(p.title);
    const existing = slugMap.get(slug) ?? [];
    existing.push(p.rel);
    slugMap.set(slug, existing);
  }
  for (const [slug, rels] of slugMap) {
    if (rels.length > 1) {
      errors.push(`slug collision "${slug}": ${rels.join(", ")} — rename pages to use distinct titles`);
    }
  }

  const slugs = new Set(all.map((p) => slugify(p.title)));
  const inbound = new Set<string>();
  for (const p of all) {
    for (const link of p.links) {
      const target = slugify(link);
      if (!slugs.has(target)) {
        errors.push(`${p.rel}: broken link [[${link}]]`);
      } else {
        inbound.add(target);
      }
    }
  }
  for (const n of notes) {
    if (!inbound.has(slugify(n.title))) {
      warnings.push(`orphan note: ${n.rel} (${n.title})`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
