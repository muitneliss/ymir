import { join } from "node:path";
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
  const sources = loadDir(root, "sources", errors);
  const notes = loadDir(root, "notes", errors);
  const all = [...sources, ...notes];

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
