# Ymir Wiki Harness + Wiki CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ymir scaffold an LLM-maintained wiki skeleton into a target project, backed by a TypeScript CLI that owns all wiki writes (format + validate) and a PreToolUse hook that blocks hand-editing.

**Architecture:** A bundled TS/Node CLI (`plugins/ymir/wiki-cli`) is the only sanctioned write path — it injects frontmatter, places files, formats, validates, and rebuilds index/log atomically. A PreToolUse hook scaffolded into the target project denies `Write/Edit/MultiEdit` on wiki content paths. `qmd` provides read/search. Ymir's `SKILL.md` wiki branch copies templates + installs the hook.

**Tech Stack:** TypeScript (ESM, Node 18+), commander, gray-matter, remark (+ remark-frontmatter, remark-gfm, remark-stringify), zod, tsup (bundle), vitest (test). qmd (external, read side).

---

## File Structure

```
plugins/ymir/wiki-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── cli.ts            # commander entry → dist/cli.js
│   ├── paths.ts          # root resolution, slug, page paths
│   ├── schema.ts         # zod frontmatter schemas + TS types
│   ├── format.ts         # remark-based markdown formatter
│   ├── pages.ts          # render source/note page (frontmatter + body)
│   ├── store.ts          # fs read/write/list over the wiki dir
│   ├── index-build.ts    # rebuild index.md
│   ├── wikilog.ts        # append log.md entry
│   ├── validate.ts       # frontmatter + link + orphan checks
│   └── commands/
│       ├── ingest.ts
│       ├── note.ts
│       ├── reindex.ts    # the `index` command (renamed to avoid index.ts clash)
│       ├── logcmd.ts     # the `log` command
│       ├── validatecmd.ts
│       ├── fmtcmd.ts
│       ├── query.ts
│       └── help.ts
└── test/
    ├── paths.test.ts
    ├── schema.test.ts
    ├── format.test.ts
    ├── pages.test.ts
    ├── index-build.test.ts
    ├── wikilog.test.ts
    ├── validate.test.ts
    ├── ingest.test.ts
    ├── note.test.ts
    └── query.test.ts

plugins/ymir/templates/
├── wiki/
│   ├── SCHEMA.md
│   ├── index.seed.md
│   ├── log.seed.md
│   └── gitkeep            # copied as .gitkeep into raw/ sources/ notes/
└── hooks/
    ├── block-wiki-edits.mjs
    └── settings.snippet.json

plugins/ymir/SKILL.md      # modify: implement wiki/context branch
README.md                  # modify
plugins/ymir/.claude-plugin/plugin.json  # modify (version bump)
```

**Module boundaries:** `store` is the only fs layer. `schema`/`format`/`pages`/`index-build`/`wikilog`/`validate` are pure-ish logic on strings/objects. `commands/*` wire logic + store + run fmt→validate before any write. `cli.ts` only does commander plumbing.

---

## Task 0: CLI project scaffold

**Files:**
- Create: `plugins/ymir/wiki-cli/package.json`
- Create: `plugins/ymir/wiki-cli/tsconfig.json`
- Create: `plugins/ymir/wiki-cli/tsup.config.ts`
- Create: `plugins/ymir/wiki-cli/vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@ymir/wiki-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "wiki": "dist/cli.js" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "gray-matter": "^4.0.3",
    "remark": "^15.0.1",
    "remark-frontmatter": "^5.0.0",
    "remark-gfm": "^4.0.0",
    "remark-stringify": "^11.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "tsup": "^8.2.4",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node18",
  bundle: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 5: Install deps**

Run: `cd plugins/ymir/wiki-cli && npm install`
Expected: `node_modules` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/wiki-cli/package.json plugins/ymir/wiki-cli/package-lock.json plugins/ymir/wiki-cli/tsconfig.json plugins/ymir/wiki-cli/tsup.config.ts plugins/ymir/wiki-cli/vitest.config.ts
git commit -m "chore(wiki-cli): scaffold TS project (tsup + vitest)"
```

---

## Task 1: paths + slug

**Files:**
- Create: `plugins/ymir/wiki-cli/src/paths.ts`
- Test: `plugins/ymir/wiki-cli/test/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { slugify, sourcePath, notePath, wikiPaths } from "../src/paths.js";

describe("slugify", () => {
  it("lowercases, trims, hyphenates", () => {
    expect(slugify("  Hello World!  ")).toBe("hello-world");
    expect(slugify("API & Auth/v2")).toBe("api-auth-v2");
  });
});

describe("paths", () => {
  it("builds source/note paths under root", () => {
    expect(sourcePath("/w", "My Title")).toBe("/w/sources/my-title.md");
    expect(notePath("/w", "Token Bucket")).toBe("/w/notes/token-bucket.md");
  });
  it("exposes core wiki paths", () => {
    const p = wikiPaths("/w");
    expect(p.index).toBe("/w/index.md");
    expect(p.log).toBe("/w/log.md");
    expect(p.sourcesDir).toBe("/w/sources");
    expect(p.notesDir).toBe("/w/notes");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- paths`
Expected: FAIL — cannot find module `../src/paths.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { join } from "node:path";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- paths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/paths.ts plugins/ymir/wiki-cli/test/paths.test.ts
git commit -m "feat(wiki-cli): path + slug helpers"
```

---

## Task 2: frontmatter schema (zod)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/schema.ts`
- Test: `plugins/ymir/wiki-cli/test/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { sourceFrontmatter, noteFrontmatter, NoteType } from "../src/schema.js";

describe("sourceFrontmatter", () => {
  it("accepts valid source frontmatter", () => {
    const r = sourceFrontmatter.safeParse({
      title: "T", type: "source", date: "2026-06-17",
      tags: ["a"], source: "raw/t.pdf", ingested: "2026-06-17",
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing source path", () => {
    const r = sourceFrontmatter.safeParse({
      title: "T", type: "source", date: "2026-06-17", tags: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("noteFrontmatter", () => {
  it("accepts valid note frontmatter", () => {
    const r = noteFrontmatter.safeParse({
      title: "Token Bucket", type: "concept", date: "2026-06-17",
      tags: [], source_count: 2,
    });
    expect(r.success).toBe(true);
  });
  it("rejects bad note type", () => {
    const r = noteFrontmatter.safeParse({
      title: "X", type: "source", date: "2026-06-17", tags: [], source_count: 0,
    });
    expect(r.success).toBe(false);
  });
  it("enumerates note types", () => {
    expect(NoteType.options).toEqual(["entity", "concept", "topic"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const NoteType = z.enum(["entity", "concept", "topic"]);
export type NoteTypeT = z.infer<typeof NoteType>;

export const sourceFrontmatter = z.object({
  title: z.string().min(1),
  type: z.literal("source"),
  date: isoDate,
  tags: z.array(z.string()),
  source: z.string().min(1),
  ingested: isoDate,
});
export type SourceFrontmatter = z.infer<typeof sourceFrontmatter>;

export const noteFrontmatter = z.object({
  title: z.string().min(1),
  type: NoteType,
  date: isoDate,
  tags: z.array(z.string()),
  source_count: z.number().int().nonnegative(),
});
export type NoteFrontmatter = z.infer<typeof noteFrontmatter>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/schema.ts plugins/ymir/wiki-cli/test/schema.test.ts
git commit -m "feat(wiki-cli): zod frontmatter schemas"
```

---

## Task 3: markdown formatter

**Files:**
- Create: `plugins/ymir/wiki-cli/src/format.ts`
- Test: `plugins/ymir/wiki-cli/test/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatMarkdown } from "../src/format.js";

describe("formatMarkdown", () => {
  it("normalizes and is idempotent", async () => {
    const messy = "# Title\n\n\n\nsome   text\n";
    const once = await formatMarkdown(messy);
    const twice = await formatMarkdown(once);
    expect(once).toBe(twice);
    expect(once).toContain("# Title");
  });
  it("preserves frontmatter block", async () => {
    const src = "---\ntitle: T\n---\n# H\n";
    const out = await formatMarkdown(src);
    expect(out.startsWith("---")).toBe(true);
    expect(out).toContain("title: T");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

const processor = remark()
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm);

export async function formatMarkdown(input: string): Promise<string> {
  const file = await processor.process(input);
  return String(file);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/format.ts plugins/ymir/wiki-cli/test/format.test.ts
git commit -m "feat(wiki-cli): remark markdown formatter"
```

---

## Task 4: page rendering

**Files:**
- Create: `plugins/ymir/wiki-cli/src/pages.ts`
- Test: `plugins/ymir/wiki-cli/test/pages.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderSourcePage, renderNotePage } from "../src/pages.js";

describe("renderSourcePage", () => {
  it("emits validated frontmatter + body", async () => {
    const out = await renderSourcePage({
      title: "My Doc", source: "raw/my-doc.pdf", date: "2026-06-17",
      tags: ["x"], body: "Key point.",
    });
    expect(out).toContain("type: source");
    expect(out).toContain("source: raw/my-doc.pdf");
    expect(out).toContain("# My Doc");
    expect(out).toContain("Key point.");
  });
});

describe("renderNotePage", () => {
  it("emits note frontmatter + body", async () => {
    const out = await renderNotePage({
      name: "Token Bucket", type: "concept", date: "2026-06-17",
      tags: [], sourceCount: 1, body: "A rate limiter.",
    });
    expect(out).toContain("type: concept");
    expect(out).toContain("source_count: 1");
    expect(out).toContain("# Token Bucket");
  });
  it("throws on invalid frontmatter", async () => {
    await expect(renderNotePage({
      name: "", type: "concept", date: "bad", tags: [], sourceCount: 0, body: "x",
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pages`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import matter from "gray-matter";
import { formatMarkdown } from "./format.js";
import { sourceFrontmatter, noteFrontmatter, type NoteTypeT } from "./schema.js";

export interface SourcePageInput {
  title: string; source: string; date: string; tags: string[]; body: string;
}
export interface NotePageInput {
  name: string; type: NoteTypeT; date: string; tags: string[];
  sourceCount: number; body: string;
}

export async function renderSourcePage(i: SourcePageInput): Promise<string> {
  const fm = sourceFrontmatter.parse({
    title: i.title, type: "source", date: i.date,
    tags: i.tags, source: i.source, ingested: i.date,
  });
  const md = matter.stringify(`# ${i.title}\n\n${i.body}\n`, fm);
  return formatMarkdown(md);
}

export async function renderNotePage(i: NotePageInput): Promise<string> {
  const fm = noteFrontmatter.parse({
    title: i.name, type: i.type, date: i.date,
    tags: i.tags, source_count: i.sourceCount,
  });
  const md = matter.stringify(`# ${i.name}\n\n${i.body}\n`, fm);
  return formatMarkdown(md);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pages`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/pages.ts plugins/ymir/wiki-cli/test/pages.test.ts
git commit -m "feat(wiki-cli): source/note page rendering"
```

---

## Task 5: store (fs layer)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/store.ts`
- Test: `plugins/ymir/wiki-cli/test/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage, readPage, listPages, appendFileLine } from "../src/store.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("store", () => {
  it("writes and reads a page (creating dirs)", () => {
    const p = join(root, "notes", "a.md");
    writePage(p, "hello");
    expect(readPage(p)).toBe("hello");
  });
  it("lists .md files in a dir, empty if missing", () => {
    expect(listPages(join(root, "notes"))).toEqual([]);
    writePage(join(root, "notes", "a.md"), "x");
    writePage(join(root, "notes", "b.md"), "y");
    expect(listPages(join(root, "notes")).sort()).toEqual(["a.md", "b.md"]);
  });
  it("appends a line to a file", () => {
    const f = join(root, "log.md");
    appendFileLine(f, "line1");
    appendFileLine(f, "line2");
    expect(readPage(f)).toBe("line1\nline2\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- store`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  mkdirSync, writeFileSync, readFileSync, readdirSync,
  existsSync, appendFileSync,
} from "node:fs";
import { dirname } from "node:path";

export function writePage(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function readPage(path: string): string {
  return readFileSync(path, "utf8");
}

export function listPages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}

export function appendFileLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/store.ts plugins/ymir/wiki-cli/test/store.test.ts
git commit -m "feat(wiki-cli): fs store layer"
```

---

## Task 6: index rebuild

**Files:**
- Create: `plugins/ymir/wiki-cli/src/index-build.ts`
- Test: `plugins/ymir/wiki-cli/test/index-build.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "../src/store.js";
import { buildIndex } from "../src/index-build.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("buildIndex", () => {
  it("catalogs sources and notes by category with links", () => {
    writePage(join(root, "sources", "doc-a.md"),
      "---\ntitle: Doc A\ntype: source\ndate: 2026-06-17\ntags: []\nsource: raw/a.pdf\ningested: 2026-06-17\n---\n# Doc A\n");
    writePage(join(root, "notes", "token-bucket.md"),
      "---\ntitle: Token Bucket\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 1\n---\n# Token Bucket\n");
    const md = buildIndex(root);
    expect(md).toContain("# Wiki Index");
    expect(md).toContain("## Sources");
    expect(md).toContain("[Doc A](sources/doc-a.md)");
    expect(md).toContain("## Notes");
    expect(md).toContain("[Token Bucket](notes/token-bucket.md)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- index-build`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import matter from "gray-matter";
import { join } from "node:path";
import { listPages, readPage } from "./store.js";

function entries(root: string, sub: string): string[] {
  return listPages(join(root, sub))
    .sort()
    .map((file) => {
      const fm = matter(readPage(join(root, sub, file))).data as { title?: string };
      const title = fm.title ?? file.replace(/\.md$/, "");
      return `- [${title}](${sub}/${file})`;
    });
}

export function buildIndex(root: string): string {
  const sources = entries(root, "sources");
  const notes = entries(root, "notes");
  const lines = ["# Wiki Index", ""];
  lines.push("## Sources", "");
  lines.push(...(sources.length ? sources : ["_none yet_"]), "");
  lines.push("## Notes", "");
  lines.push(...(notes.length ? notes : ["_none yet_"]), "");
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- index-build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/index-build.ts plugins/ymir/wiki-cli/test/index-build.test.ts
git commit -m "feat(wiki-cli): index.md rebuild"
```

---

## Task 7: log append

**Files:**
- Create: `plugins/ymir/wiki-cli/src/wikilog.ts`
- Test: `plugins/ymir/wiki-cli/test/wikilog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { appendLog } from "../src/wikilog.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("appendLog", () => {
  it("appends a greppable dated entry", () => {
    appendLog(root, "ingest", "Doc A", "2026-06-17");
    const md = readPage(join(root, "log.md"));
    expect(md).toContain("## [2026-06-17] ingest | Doc A");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wikilog`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import { appendFileLine } from "./store.js";
import { wikiPaths } from "./paths.js";

export type LogOp = "ingest" | "note" | "index" | "query" | "lint";

export function appendLog(root: string, op: LogOp, title: string, date: string): void {
  appendFileLine(wikiPaths(root).log, `## [${date}] ${op} | ${title}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wikilog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/wikilog.ts plugins/ymir/wiki-cli/test/wikilog.test.ts
git commit -m "feat(wiki-cli): log.md append"
```

---

## Task 8: validate

**Files:**
- Create: `plugins/ymir/wiki-cli/src/validate.ts`
- Test: `plugins/ymir/wiki-cli/test/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage } from "../src/store.js";
import { validateWiki } from "../src/validate.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

const goodNote = (title: string, body = "") =>
  `---\ntitle: ${title}\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 0\n---\n# ${title}\n\n${body}\n`;

describe("validateWiki", () => {
  it("passes a clean wiki", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A", "see [[B]]"));
    writePage(join(root, "notes", "b.md"), goodNote("B", "see [[A]]"));
    const r = validateWiki(root);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it("flags bad frontmatter", () => {
    writePage(join(root, "notes", "bad.md"), "---\ntitle: X\ntype: nope\n---\n# X\n");
    const r = validateWiki(root);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("frontmatter"))).toBe(true);
  });
  it("flags broken wikilinks", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A", "see [[Ghost]]"));
    const r = validateWiki(root);
    expect(r.errors.some((e) => e.includes("broken link") && e.includes("Ghost"))).toBe(true);
  });
  it("warns on orphan notes", () => {
    writePage(join(root, "notes", "a.md"), goodNote("A"));
    const r = validateWiki(root);
    expect(r.warnings.some((w) => w.includes("orphan") && w.includes("A"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import matter from "gray-matter";
import { join } from "node:path";
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
    const parsed = matter(readPage(join(root, sub, file)));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/validate.ts plugins/ymir/wiki-cli/test/validate.test.ts
git commit -m "feat(wiki-cli): wiki validation (frontmatter, links, orphans)"
```

---

## Task 9: ingest command

**Files:**
- Create: `plugins/ymir/wiki-cli/src/commands/ingest.ts`
- Test: `plugins/ymir/wiki-cli/test/ingest.test.ts`

Note: `today()` is a parameter so tests are deterministic.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPage } from "../src/store.js";
import { runIngest } from "../src/commands/ingest.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

describe("runIngest", () => {
  it("writes a validated source page, rebuilds index, appends log", async () => {
    await runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "Key takeaway. See [[Doc A]].", today: "2026-06-17",
    });
    const page = readPage(join(root, "sources", "doc-a.md"));
    expect(page).toContain("type: source");
    expect(page).toContain("source: raw/a.pdf");
    expect(readPage(join(root, "index.md"))).toContain("[Doc A](sources/doc-a.md)");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-06-17] ingest | Doc A");
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(true);
  });

  it("rejects when result fails validation (no file written)", async () => {
    await expect(runIngest({
      root, raw: "raw/a.pdf", title: "Doc A",
      body: "See [[Ghost]].", today: "2026-06-17",
    })).rejects.toThrow(/broken link/);
    expect(existsSync(join(root, "sources", "doc-a.md"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ingest`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

Write-then-validate-then-rollback: write the page, run `validateWiki`; if it fails, delete the page and throw.

```ts
import { rmSync } from "node:fs";
import { renderSourcePage } from "../pages.js";
import { writePage, readPage } from "../store.js";
import { sourcePath, wikiPaths } from "../paths.js";
import { buildIndex } from "../index-build.js";
import { appendLog } from "../wikilog.js";
import { validateWiki } from "../validate.js";

export interface IngestInput {
  root: string; raw: string; title: string; body: string; today: string;
}

export async function runIngest(i: IngestInput): Promise<string> {
  const page = await renderSourcePage({
    title: i.title, source: i.raw, date: i.today, tags: [], body: i.body,
  });
  const path = sourcePath(i.root, i.title);
  writePage(path, page);

  const result = validateWiki(i.root);
  if (!result.ok) {
    rmSync(path);
    throw new Error(`ingest rejected:\n${result.errors.join("\n")}`);
  }

  writePage(wikiPaths(i.root).index, buildIndex(i.root));
  appendLog(i.root, "ingest", i.title, i.today);
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ingest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/commands/ingest.ts plugins/ymir/wiki-cli/test/ingest.test.ts
git commit -m "feat(wiki-cli): ingest command (write→validate→index→log)"
```

---

## Task 10: note command

**Files:**
- Create: `plugins/ymir/wiki-cli/src/commands/note.ts`
- Test: `plugins/ymir/wiki-cli/test/note.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePage, readPage } from "../src/store.js";
import { runNote } from "../src/commands/note.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "wiki-")); });

const seedNote = (title: string, body = "") =>
  `---\ntitle: ${title}\ntype: concept\ndate: 2026-06-17\ntags: []\nsource_count: 0\n---\n# ${title}\n\n${body}\n`;

describe("runNote", () => {
  it("creates a validated note, rebuilds index, appends log", async () => {
    // existing inbound link so the new note is not an orphan-blocking error (orphan is warning only)
    await runNote({
      root, type: "concept", name: "Token Bucket",
      body: "A rate limiter.", today: "2026-06-17",
    });
    const page = readPage(join(root, "notes", "token-bucket.md"));
    expect(page).toContain("type: concept");
    expect(readPage(join(root, "index.md"))).toContain("[Token Bucket](notes/token-bucket.md)");
    expect(readPage(join(root, "log.md"))).toContain("## [2026-06-17] note | Token Bucket");
  });

  it("rejects on broken link and writes nothing", async () => {
    await expect(runNote({
      root, type: "concept", name: "X", body: "see [[Ghost]]", today: "2026-06-17",
    })).rejects.toThrow(/broken link/);
    expect(existsSync(join(root, "notes", "x.md"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- note`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- note`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/commands/note.ts plugins/ymir/wiki-cli/test/note.test.ts
git commit -m "feat(wiki-cli): note command (create/update with rollback)"
```

---

## Task 11: query command (qmd wrapper)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/commands/query.ts`
- Test: `plugins/ymir/wiki-cli/test/query.test.ts`

qmd is invoked as a subprocess. The runner is injected so tests don't shell out.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runQuery } from "../src/commands/query.js";

describe("runQuery", () => {
  it("invokes qmd query with json/files flags and returns stdout", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeRun = async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return '[{"path":"wiki/notes/a.md","score":0.9}]';
    };
    const out = await runQuery({ root: "/w", q: "rate limit", runner: fakeRun });
    expect(calls[0]!.cmd).toBe("qmd");
    expect(calls[0]!.args).toContain("query");
    expect(calls[0]!.args).toContain("rate limit");
    expect(calls[0]!.args).toContain("--json");
    expect(out).toContain("wiki/notes/a.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- query`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
import { spawn } from "node:child_process";

export type Runner = (cmd: string, args: string[]) => Promise<string>;

const defaultRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `qmd exited ${code}`)),
    );
  });

export interface QueryInput {
  root: string; q: string; runner?: Runner;
}

export async function runQuery(i: QueryInput): Promise<string> {
  const run = i.runner ?? defaultRunner;
  return run("qmd", ["query", i.q, "--json", "--files"]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- query`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/commands/query.ts plugins/ymir/wiki-cli/test/query.test.ts
git commit -m "feat(wiki-cli): query command (qmd wrapper)"
```

---

## Task 12: CLI entrypoint (commander) + help

**Files:**
- Create: `plugins/ymir/wiki-cli/src/cli.ts`
- Create: `plugins/ymir/wiki-cli/src/commands/help.ts`

No unit test (thin wiring); covered by the build smoke test in Step 4 + scaffold smoke test in Task 15.

- [ ] **Step 1: Write the help text module**

```ts
export const HELP_TEXT = `wiki — Ymir wiki CLI (the ONLY way to write wiki docs)

You must NOT hand-write or hand-edit files under wiki/sources, wiki/notes,
index.md, or log.md. Use these commands; they format + validate every write.

Commands:
  ingest --raw <path> --title <t>     Ingest a source from wiki/raw into a summary page.
                                      Body is read from STDIN.
  note --type <entity|concept|topic> --name <n>
                                      Create/update a synthesis note. Body from STDIN.
  index                               Rebuild index.md from all pages.
  log <op> <title>                    Append a dated entry to log.md.
  validate                            Check frontmatter, [[links]], orphans. Exit !=0 on error.
  fmt                                 Format all wiki markdown (remark).
  query <q>                           Search the wiki via qmd (read side).
  help                                Show this text.

Page conventions:
  Source page frontmatter: title, type=source, date, tags[], source, ingested
  Note page frontmatter:   title, type=entity|concept|topic, date, tags[], source_count
  Cross-reference other pages with [[Exact Title]].

Examples:
  echo "Key points..." | wiki ingest --raw raw/paper.pdf --title "Rate Limiting"
  echo "A token-bucket limiter. See [[Rate Limiting]]." | wiki note --type concept --name "Token Bucket"
  wiki query "how does backoff work"
  wiki validate
`;

export function runHelp(): void {
  process.stdout.write(HELP_TEXT);
}
```

- [ ] **Step 2: Write cli.ts**

`--root` defaults to `./wiki`. Body-bearing commands read STDIN. `validate` exits nonzero on errors.

```ts
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { runIngest } from "./commands/ingest.js";
import { runNote } from "./commands/note.js";
import { runQuery } from "./commands/query.js";
import { runHelp } from "./commands/help.js";
import { buildIndex } from "./index-build.js";
import { appendLog, type LogOp } from "./wikilog.js";
import { validateWiki } from "./validate.js";
import { formatMarkdown } from "./format.js";
import { writePage, readPage, listPages } from "./store.js";
import { wikiPaths } from "./paths.js";
import { NoteType } from "./schema.js";
import { join } from "node:path";

const today = () => new Date().toISOString().slice(0, 10);
const readStdin = () => readFileSync(0, "utf8");

const program = new Command();
program.name("wiki").description("Ymir wiki CLI").option("--root <dir>", "wiki root", "wiki");

program
  .command("ingest")
  .requiredOption("--raw <path>")
  .requiredOption("--title <title>")
  .action(async (opts) => {
    const root = program.opts().root as string;
    const path = await runIngest({ root, raw: opts.raw, title: opts.title, body: readStdin(), today: today() });
    process.stdout.write(`wrote ${path}\n`);
  });

program
  .command("note")
  .requiredOption("--type <type>")
  .requiredOption("--name <name>")
  .action(async (opts) => {
    const root = program.opts().root as string;
    const type = NoteType.parse(opts.type);
    const path = await runNote({ root, type, name: opts.name, body: readStdin(), today: today() });
    process.stdout.write(`wrote ${path}\n`);
  });

program.command("index").action(async () => {
  const root = program.opts().root as string;
  writePage(wikiPaths(root).index, buildIndex(root));
  process.stdout.write("rebuilt index.md\n");
});

program.command("log").argument("<op>").argument("<title>").action((op: string, title: string) => {
  const root = program.opts().root as string;
  appendLog(root, op as LogOp, title, today());
});

program.command("validate").action(() => {
  const root = program.opts().root as string;
  const r = validateWiki(root);
  for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
  for (const e of r.errors) process.stderr.write(`error: ${e}\n`);
  if (!r.ok) process.exit(1);
  process.stdout.write("wiki valid\n");
});

program.command("fmt").action(async () => {
  const root = program.opts().root as string;
  for (const sub of ["sources", "notes"] as const) {
    for (const f of listPages(join(root, sub))) {
      const p = join(root, sub, f);
      writePage(p, await formatMarkdown(readPage(p)));
    }
  }
  process.stdout.write("formatted\n");
});

program.command("query").argument("<q>").action(async (q: string) => {
  const root = program.opts().root as string;
  process.stdout.write(await runQuery({ root, q }));
});

program.command("help").action(() => runHelp());

program.parseAsync();
```

- [ ] **Step 3: Build the bundle**

Run: `cd plugins/ymir/wiki-cli && npm run build`
Expected: `dist/cli.js` created, no type errors.

- [ ] **Step 4: Smoke-test the built CLI**

```bash
cd plugins/ymir/wiki-cli
TMP=$(mktemp -d)
echo "Key points. See [[Rate Limiting]]." | node dist/cli.js --root "$TMP" ingest --raw raw/p.pdf --title "Rate Limiting"
node dist/cli.js --root "$TMP" validate
node dist/cli.js help | head -1
```

Expected: `wrote .../sources/rate-limiting.md`, then `wiki valid`, then the help banner line.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/cli.ts plugins/ymir/wiki-cli/src/commands/help.ts plugins/ymir/wiki-cli/dist
git commit -m "feat(wiki-cli): commander entrypoint + help, build bundle"
```

---

## Task 13: wiki templates

**Files:**
- Create: `plugins/ymir/templates/wiki/SCHEMA.md`
- Create: `plugins/ymir/templates/wiki/index.seed.md`
- Create: `plugins/ymir/templates/wiki/log.seed.md`
- Create: `plugins/ymir/templates/wiki/gitkeep`

- [ ] **Step 1: Create SCHEMA.md**

```markdown
# Wiki Schema & Rules

This wiki is an LLM-maintained knowledge base. **You (the LLM) never hand-write
or hand-edit wiki documents.** All writes go through the Ymir wiki CLI, which
formats and validates every change. Direct edits to `sources/`, `notes/`,
`index.md`, and `log.md` are blocked by a PreToolUse hook.

## Layers
- `raw/` — immutable sources. You may read these; never edit them. The user adds files here.
- `sources/` — one CLI-written summary page per ingested source.
- `notes/` — CLI-written entity / concept / topic pages (the synthesis).
- `index.md` — CLI-rebuilt catalog. Never edit by hand.
- `log.md` — CLI-appended timeline. Never edit by hand.

## The CLI
Invoke via the bundled binary:

```
node ${CLAUDE_PLUGIN_ROOT}/wiki-cli/dist/cli.js --root ./wiki <command>
```

Run `... help` for the full command reference. Key commands:
- `ingest --raw <raw/path> --title <t>` (body on STDIN) — summarize a source.
- `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
- `index` — rebuild the catalog.
- `validate` — health check (frontmatter, `[[links]]`, orphans).
- `query <q>` — search via qmd.

## Page conventions
- Cross-reference pages with `[[Exact Title]]`. The CLI validates every link target exists.
- Frontmatter is injected by the CLI — do not write it yourself.

## Operations
- **Ingest:** user drops a file in `raw/` → you read it, discuss takeaways → call
  `ingest` with the extracted body → then update related `notes` via `note`.
- **Query:** call `query` → read returned pages → answer with citations →
  optionally file the answer back as a `note`.
- **Lint:** run `validate` → fix reported issues by issuing further CLI commands.

## Search (qmd) setup
One-time, on this machine:

```
qmd collection add ./wiki --name PROJECT_NAME-wiki
qmd embed
```

Then `wiki query "..."` (which shells out to `qmd query --json --files`).
Optional tighter integration: add a `qmd` MCP server (`qmd mcp`) to your client.
```

- [ ] **Step 2: Create index.seed.md**

```markdown
# Wiki Index

## Sources

_none yet_

## Notes

_none yet_
```

- [ ] **Step 3: Create log.seed.md**

```markdown
# Wiki Log

```

- [ ] **Step 4: Create gitkeep (empty file)**

Create `plugins/ymir/templates/wiki/gitkeep` as an empty file (copied to `raw/.gitkeep`, `sources/.gitkeep`, `notes/.gitkeep` during scaffold).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/templates/wiki
git commit -m "feat(ymir): wiki scaffold templates (SCHEMA, seeds, gitkeep)"
```

---

## Task 14: PreToolUse hook template

**Files:**
- Create: `plugins/ymir/templates/hooks/block-wiki-edits.mjs`
- Create: `plugins/ymir/templates/hooks/settings.snippet.json`
- Test: `plugins/ymir/wiki-cli/test/hook.test.ts`

The hook script has no project deps (pure Node), so it can be unit-tested by spawning it with stdin JSON.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const HOOK = join(__dirname, "..", "..", "templates", "hooks", "block-wiki-edits.mjs");

function runHook(input: object) {
  const r = spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  return { stdout: r.stdout, status: r.status };
}

describe("block-wiki-edits hook", () => {
  it("denies Write to wiki/notes", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/notes/a.md" } });
    expect(stdout).toContain('"permissionDecision": "deny"');
  });
  it("denies Edit to wiki/index.md", () => {
    const { stdout } = runHook({ tool_name: "Edit", cwd: "/p", tool_input: { file_path: "/p/wiki/index.md" } });
    expect(stdout).toContain('"permissionDecision": "deny"');
  });
  it("allows Write to wiki/raw", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/raw/a.pdf" } });
    expect(stdout.trim()).toBe("");
  });
  it("allows Write to wiki/SCHEMA.md", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/wiki/SCHEMA.md" } });
    expect(stdout.trim()).toBe("");
  });
  it("allows unrelated files", () => {
    const { stdout } = runHook({ tool_name: "Write", cwd: "/p", tool_input: { file_path: "/p/src/app.ts" } });
    expect(stdout.trim()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/ymir/wiki-cli && npm test -- hook`
Expected: FAIL — hook file does not exist (spawn error / empty stdout).

- [ ] **Step 3: Write the hook script**

`plugins/ymir/templates/hooks/block-wiki-edits.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input?.tool_input?.file_path ?? "";

// normalize to a project-relative-ish path for matching
const norm = file.replaceAll("\\", "/");

const blocked =
  /\/wiki\/sources\//.test(norm) ||
  /\/wiki\/notes\//.test(norm) ||
  /\/wiki\/index\.md$/.test(norm) ||
  /\/wiki\/log\.md$/.test(norm);

if (blocked) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Wiki docs are CLI-managed. Use the Ymir wiki CLI (ingest/note/index/log) instead of editing wiki files directly. Allowed direct edits: wiki/raw/** and wiki/SCHEMA.md.",
      },
    }),
  );
}
process.exit(0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/ymir/wiki-cli && npm test -- hook`
Expected: PASS (all 5).

- [ ] **Step 5: Create settings.snippet.json**

`plugins/ymir/templates/hooks/settings.snippet.json` (merged into the project's `.claude/settings.json` during scaffold):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-wiki-edits.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/templates/hooks plugins/ymir/wiki-cli/test/hook.test.ts
git commit -m "feat(ymir): PreToolUse hook blocking direct wiki edits"
```

---

## Task 15: SKILL.md wiki/context branch

**Files:**
- Modify: `plugins/ymir/SKILL.md`

Replace the Step 2 TODO stub with a concrete, executable description of the
wiki/context action. (Ymir is skill-driven, so this is prose the agent follows,
not code — but it must be exact and reference the real templates + CLI.)

- [ ] **Step 1: Read current SKILL.md Step 2**

Run: `sed -n '49,68p' plugins/ymir/SKILL.md`
Expected: shows the `## Step 2 — Scaffold` TODO block and `## Boundaries`.

- [ ] **Step 2: Replace the Step 2 TODO with the wiki branch**

Replace the block from `## Step 2 — Scaffold` up to (but not including) `## Boundaries` with:

````markdown
## Step 2 — Scaffold

Map the intent to a harness concern and scaffold it into the current project
(cwd). Other concerns (lint, CI, rules, CLAUDE.md) are still stubbed; the
**wiki / context** concern is implemented below.

### wiki / context

Triggered by intents like `ymir add context`, `ymir add wiki`, or as part of
`ymir init`. This lays down an LLM-maintained wiki backed by the Ymir wiki CLI.

Do all of the following with tools (Bash/Write), in order:

1. **Create the tree** under the project root:
   - `wiki/raw/`, `wiki/sources/`, `wiki/notes/` — each with a `.gitkeep`
     (copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/gitkeep`).
   - `wiki/SCHEMA.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/SCHEMA.md`,
     then replace the literal `PROJECT_NAME` with the current directory's base
     name.
   - `wiki/index.md` — copy `templates/wiki/index.seed.md`.
   - `wiki/log.md` — copy `templates/wiki/log.seed.md`.
2. **Install the hook**:
   - Copy `${CLAUDE_PLUGIN_ROOT}/templates/hooks/block-wiki-edits.mjs` to
     `.claude/hooks/block-wiki-edits.mjs`.
   - Merge `templates/hooks/settings.snippet.json` into `.claude/settings.json`.
     If `.claude/settings.json` exists, deep-merge the `hooks.PreToolUse` array
     (append the matcher entry; do not clobber existing hooks). If it does not
     exist, create it from the snippet.
3. **Point CLAUDE.md at the wiki**: append (creating the file if absent) a block:

   ```markdown
   ## Wiki / Context
   This project has an LLM-maintained wiki under `wiki/`. You MUST NOT hand-edit
   wiki docs (`wiki/sources`, `wiki/notes`, `index.md`, `log.md`) — they are
   managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
   `wiki/SCHEMA.md` for the rules and command reference.
   ```
4. **Verify**: run
   `node ${CLAUDE_PLUGIN_ROOT}/wiki-cli/dist/cli.js --root ./wiki validate`
   and confirm it prints `wiki valid`. If it errors, stop and report.
5. **Tell the user** the qmd one-time setup (from `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki && qmd embed`.

Never write application code; only the harness skeleton above.
````

- [ ] **Step 3: Verify the edit reads correctly**

Run: `sed -n '36,120p' plugins/ymir/SKILL.md`
Expected: the socratic-interview Step 1 remains, Step 2 now contains the wiki branch, `## Boundaries` still follows.

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "feat(ymir): implement wiki/context scaffold branch in SKILL.md"
```

---

## Task 16: scaffold smoke test + docs

**Files:**
- Create: `plugins/ymir/wiki-cli/test/scaffold.test.ts`
- Modify: `README.md`
- Modify: `plugins/ymir/.claude-plugin/plugin.json`

- [ ] **Step 1: Write a scaffold smoke test**

This emulates the SKILL.md file operations (copy templates, render name) and
asserts a healthy wiki via the CLI library functions.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { validateWiki } from "../src/validate.js";

const TPL = join(__dirname, "..", "..", "templates", "wiki");

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "proj-")); });

describe("wiki scaffold", () => {
  it("produces a valid wiki from templates", () => {
    const wiki = join(proj, "wiki");
    for (const d of ["raw", "sources", "notes"]) {
      cpSync(join(TPL, "gitkeep"), join(wiki, d, ".gitkeep"));
    }
    const schema = readFileSync(join(TPL, "SCHEMA.md"), "utf8")
      .replaceAll("PROJECT_NAME", basename(proj));
    writeFileSync(join(wiki, "SCHEMA.md"), schema);
    cpSync(join(TPL, "index.seed.md"), join(wiki, "index.md"));
    cpSync(join(TPL, "log.seed.md"), join(wiki, "log.md"));

    expect(existsSync(join(wiki, "raw", ".gitkeep"))).toBe(true);
    expect(schema).not.toContain("PROJECT_NAME");
    const r = validateWiki(wiki);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the full test suite**

Run: `cd plugins/ymir/wiki-cli && npm test`
Expected: all suites PASS (paths, schema, format, pages, store, index-build, wikilog, validate, ingest, note, query, hook, scaffold).

- [ ] **Step 3: Update README.md**

Update the `## Status` section to reflect the wiki piece is implemented. Replace
the existing Status block:

```markdown
## Status

`v0.2.0`. The **wiki / context** harness piece is implemented: `/ymir add
context` scaffolds an LLM-maintained `wiki/` (backed by the bundled wiki CLI in
`plugins/ymir/wiki-cli`), installs a PreToolUse hook that blocks hand-editing
wiki docs, and wires in `qmd` for search. The socratic interview and the other
harness pieces (lint, CI, rules) are still stubbed.
```

- [ ] **Step 4: Bump plugin version**

In `plugins/ymir/.claude-plugin/plugin.json`, change `"version": "0.1.0"` to
`"version": "0.2.0"`.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/test/scaffold.test.ts README.md plugins/ymir/.claude-plugin/plugin.json
git commit -m "test(ymir): scaffold smoke test; docs + version bump to 0.2.0"
```

---

## Final verification

- [ ] Run `cd plugins/ymir/wiki-cli && npm run build && npm test` → bundle builds, all tests pass.
- [ ] Manually run the SKILL.md wiki branch against a throwaway dir; confirm `validate` prints `wiki valid` and a `Write` to `wiki/notes/x.md` is denied by the hook.
- [ ] Open a PR from `feat/ymir-wiki-harness` (do not merge to main directly).
