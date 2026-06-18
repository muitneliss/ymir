# Wiki Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when a downstream file a wiki source was ingested from has changed, surface it at session start so Claude re-ingests, and keep the qmd search index fresh on every wiki write.

**Architecture:** Source pages record `source_path` + `source_hash` in frontmatter. A pure `computeStatus` re-hashes each tracked file to classify pages as current/stale/missing/untracked; `wiki status` reports it and exits nonzero on drift. A SessionStart hook runs `wiki status --json` and injects a re-ingest instruction. Write commands call a best-effort `reindex` that runs `qmd collection add`.

**Tech Stack:** TypeScript (ESM, Node), bun (build + test), commander, js-yaml, zod, remark. qmd (external, read side).

**Branch:** `feat/wiki-auto-sync` — worktree at `.worktrees/auto-sync`.

**Working dir for all CLI/test commands:** `plugins/ymir/wiki-cli`.

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/hash.ts` | CREATE | sha256 helpers |
| `src/provenance.ts` | CREATE | `fileProvenance(projectRoot, abs)` → `{sourcePath, sourceHash}` |
| `src/schema.ts` | MODIFY | add optional `source_path` / `source_hash`; make `source` optional + refine |
| `src/pages.ts` | MODIFY | render provenance fields on source pages |
| `src/commands/ingest.ts` | MODIFY | `runIngest` carries provenance fields |
| `src/status.ts` | CREATE | `computeStatus(root)`, `hasDrift(report)` |
| `src/commands/status.ts` | CREATE | `runStatus(root, json)` + human formatter |
| `src/reindex.ts` | CREATE | best-effort `qmd collection add` |
| `src/cli.ts` | MODIFY | `ingest --source`, `status`, `reindex`; `--no-reindex` on ingest/note/index |
| `hooks/wiki-sync-status.mjs` | CREATE | SessionStart drift surfacing |
| `hooks/hooks.json` | MODIFY | register SessionStart hook |
| `src/templates/wiki/SCHEMA.md` | MODIFY | document `--source` / `status` / `reindex` |
| `test/hash.test.ts` | CREATE | hash vector |
| `test/provenance.test.ts` | CREATE | relativize + hash |
| `test/schema.test.ts` | MODIFY | provenance fields + refine |
| `test/status.test.ts` | CREATE | 4 states + note review + drift exit |
| `test/reindex.test.ts` | CREATE | runner args + skip-on-failure |
| `test/ingest.test.ts` | MODIFY | provenance stored + updated on re-ingest |

---

## Task 1: `src/hash.ts` — sha256 helpers (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/hash.ts`
- Test: `plugins/ymir/wiki-cli/test/hash.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/hash.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex, hashFile } from "../src/hash.js";

describe("hash", () => {
  it("sha256Hex of empty string is the known vector", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("hashFile hashes file bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "hash-"));
    const f = join(dir, "a.txt");
    writeFileSync(f, "hello");
    expect(hashFile(f)).toBe(sha256Hex("hello"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/hash.test.ts`
Expected: FAIL — cannot find module `../src/hash.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hash.ts`:

```typescript
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashFile(path: string): string {
  return sha256Hex(readFileSync(path));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/hash.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/hash.ts plugins/ymir/wiki-cli/test/hash.test.ts
git commit -m "feat(wiki-cli): add sha256 hash helpers"
```

---

## Task 2: `src/schema.ts` — provenance frontmatter fields (TDD)

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/schema.ts`
- Test: `plugins/ymir/wiki-cli/test/schema.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `test/schema.test.ts` (inside the existing file; keep existing tests):

```typescript
import { sourceFrontmatter } from "../src/schema.js";

describe("sourceFrontmatter provenance", () => {
  const base = { title: "X", type: "source", date: "2026-06-17", tags: [], ingested: "2026-06-17" };

  it("accepts source_path + source_hash", () => {
    const r = sourceFrontmatter.safeParse({
      ...base,
      source_path: "src/a.ts",
      source_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(r.success).toBe(true);
  });

  it("accepts legacy source field without provenance", () => {
    expect(sourceFrontmatter.safeParse({ ...base, source: "raw/a.md" }).success).toBe(true);
  });

  it("rejects when neither source nor source_path present", () => {
    expect(sourceFrontmatter.safeParse(base).success).toBe(false);
  });

  it("rejects malformed source_hash", () => {
    expect(
      sourceFrontmatter.safeParse({ ...base, source_path: "src/a.ts", source_hash: "nope" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/schema.test.ts`
Expected: FAIL — `source` currently required, no `source_path`/`source_hash`.

- [ ] **Step 3: Implement**

In `src/schema.ts`, replace the `sourceFrontmatter` definition with:

```typescript
export const sourceFrontmatter = z
  .object({
    title: z.string().min(1),
    type: z.literal("source"),
    date: isoDate,
    tags: z.array(z.string()),
    source: z.string().min(1).optional(),
    source_path: z.string().min(1).optional(),
    source_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "source_hash must be lowercase sha256 hex")
      .optional(),
    ingested: isoDate,
  })
  .refine((d) => Boolean(d.source) || Boolean(d.source_path), {
    message: "source or source_path is required",
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/schema.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/schema.ts plugins/ymir/wiki-cli/test/schema.test.ts
git commit -m "feat(wiki-cli): optional source_path/source_hash provenance in source schema"
```

---

## Task 3: `src/provenance.ts` — compute provenance (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/provenance.ts`
- Test: `plugins/ymir/wiki-cli/test/provenance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/provenance.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileProvenance } from "../src/provenance.js";
import { sha256Hex } from "../src/hash.js";

describe("fileProvenance", () => {
  it("returns project-relative path and content hash", () => {
    const proj = mkdtempSync(join(tmpdir(), "proj-"));
    mkdirSync(join(proj, "src"));
    const abs = join(proj, "src", "a.ts");
    writeFileSync(abs, "code");
    const p = fileProvenance(proj, abs);
    expect(p.sourcePath).toBe("src/a.ts");
    expect(p.sourceHash).toBe(sha256Hex("code"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/provenance.test.ts`
Expected: FAIL — cannot find module `../src/provenance.js`.

- [ ] **Step 3: Implement**

Create `src/provenance.ts`:

```typescript
import { relative } from "node:path";
import { hashFile } from "./hash.js";

export interface Provenance {
  sourcePath: string;
  sourceHash: string;
}

export function fileProvenance(projectRoot: string, absPath: string): Provenance {
  return {
    sourcePath: relative(projectRoot, absPath),
    sourceHash: hashFile(absPath),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/provenance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/provenance.ts plugins/ymir/wiki-cli/test/provenance.test.ts
git commit -m "feat(wiki-cli): fileProvenance computes relative path + hash"
```

---

## Task 4: `src/pages.ts` + `commands/ingest.ts` — store provenance (TDD)

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/pages.ts`
- Modify: `plugins/ymir/wiki-cli/src/commands/ingest.ts`
- Test: `plugins/ymir/wiki-cli/test/ingest.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `test/ingest.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "../src/frontmatter.js";

describe("ingest provenance", () => {
  it("stores source_path and source_hash", async () => {
    const root = mkdtempSync(join(tmpdir(), "wiki-"));
    for (const d of ["sources", "notes"]) mkdirSync(join(root, d), { recursive: true });
    await runIngest({
      root,
      source: "raw/a.md",
      sourcePath: "raw/a.md",
      sourceHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      title: "A",
      body: "body",
      today: "2026-06-17",
    });
    const data = parseFrontmatter(readFileSync(join(root, "sources", "a.md"), "utf8")).data as {
      source_path?: string; source_hash?: string;
    };
    expect(data.source_path).toBe("raw/a.md");
    expect(data.source_hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
```

(Keep the existing ingest tests. If they call `runIngest` with `{ raw: ... }`, update those calls to `{ source: ... }` — see Step 3 for the new signature.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/ingest.test.ts`
Expected: FAIL — `runIngest` does not accept `source`/`sourcePath`/`sourceHash`.

- [ ] **Step 3: Implement**

In `src/pages.ts`, replace `SourcePageInput` and `renderSourcePage`:

```typescript
export interface SourcePageInput {
  title: string;
  source?: string;
  sourcePath?: string;
  sourceHash?: string;
  date: string;
  tags: string[];
  body: string;
}

export async function renderSourcePage(i: SourcePageInput): Promise<string> {
  const fm = sourceFrontmatter.parse({
    title: i.title,
    type: "source",
    date: i.date,
    tags: i.tags,
    ...(i.source ? { source: i.source } : {}),
    ...(i.sourcePath ? { source_path: i.sourcePath } : {}),
    ...(i.sourceHash ? { source_hash: i.sourceHash } : {}),
    ingested: i.date,
  });
  const md = stringifyFrontmatter(`# ${i.title}\n\n${i.body}\n`, fm);
  return formatMarkdown(md);
}
```

In `src/commands/ingest.ts`, replace `IngestInput` and the `renderSourcePage` call:

```typescript
export interface IngestInput {
  root: string;
  source?: string;
  sourcePath?: string;
  sourceHash?: string;
  title: string;
  body: string;
  today: string;
}

export async function runIngest(i: IngestInput): Promise<string> {
  const page = await renderSourcePage({
    title: i.title,
    source: i.source,
    sourcePath: i.sourcePath,
    sourceHash: i.sourceHash,
    date: i.today,
    tags: [],
    body: i.body,
  });
  // ... unchanged below (sourcePath(...), writePage, validate, index, log, return)
}
```

Leave the rest of `runIngest` (path resolution, validate, index rebuild, log) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/ingest.test.ts`
Expected: PASS (existing updated + new provenance test).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/pages.ts plugins/ymir/wiki-cli/src/commands/ingest.ts plugins/ymir/wiki-cli/test/ingest.test.ts
git commit -m "feat(wiki-cli): persist source provenance on ingest"
```

---

## Task 5: `src/status.ts` — drift detection (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/status.ts`
- Test: `plugins/ymir/wiki-cli/test/status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/status.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIngest } from "../src/commands/ingest.js";
import { runNote } from "../src/commands/note.js";
import { computeStatus, hasDrift } from "../src/status.js";
import { fileProvenance } from "../src/provenance.js";

let proj: string;
let root: string;
beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "proj-"));
  root = join(proj, "wiki");
  for (const d of ["sources", "notes"]) mkdirSync(join(root, d), { recursive: true });
});

async function ingestFile(title: string, rel: string, content: string) {
  const abs = join(proj, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
  const p = fileProvenance(proj, abs);
  await runIngest({ root, source: rel, sourcePath: p.sourcePath, sourceHash: p.sourceHash, title, body: "b", today: "2026-06-17" });
  return abs;
}

describe("computeStatus", () => {
  it("reports current when file unchanged", async () => {
    await ingestFile("A", "src/a.ts", "v1");
    const r = computeStatus(root);
    expect(r.sources.find((s) => s.title === "A")!.state).toBe("current");
    expect(hasDrift(r)).toBe(false);
  });

  it("reports stale when file content changes", async () => {
    const abs = await ingestFile("A", "src/a.ts", "v1");
    writeFileSync(abs, "v2");
    const r = computeStatus(root);
    expect(r.sources.find((s) => s.title === "A")!.state).toBe("stale");
    expect(hasDrift(r)).toBe(true);
  });

  it("reports missing when file deleted", async () => {
    const abs = await ingestFile("A", "src/a.ts", "v1");
    require("node:fs").rmSync(abs);
    const r = computeStatus(root);
    expect(r.sources.find((s) => s.title === "A")!.state).toBe("missing");
  });

  it("reports untracked for legacy page without hash", async () => {
    await runIngest({ root, source: "raw/x.md", title: "X", body: "b", today: "2026-06-17" });
    const r = computeStatus(root);
    expect(r.sources.find((s) => s.title === "X")!.state).toBe("untracked");
    expect(hasDrift(r)).toBe(false);
  });

  it("flags notes linking a stale source for review", async () => {
    const abs = await ingestFile("Auth Module", "src/auth.ts", "v1");
    await runNote({ root, type: "concept", name: "Auth Note", body: "see [[Auth Module]]", today: "2026-06-17" });
    writeFileSync(abs, "v2");
    const r = computeStatus(root);
    expect(r.review.map((n) => n.title)).toContain("Auth Note");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/status.test.ts`
Expected: FAIL — cannot find module `../src/status.js`.

- [ ] **Step 3: Implement**

Create `src/status.ts`:

```typescript
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { listPages, readPage } from "./store.js";
import { slugify } from "./paths.js";
import { hashFile } from "./hash.js";

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
  const sources: SourceStatus[] = [];
  const driftedSlugs = new Set<string>();

  for (const file of listPages(join(root, "sources"))) {
    const data = parseFrontmatter(readPage(join(root, "sources", file))).data as {
      title?: string;
      source_path?: string;
      source_hash?: string;
    };
    const title = data.title ?? file.replace(/\.md$/, "");
    const rel = `sources/${file}`;
    let state: SourceState;
    if (!data.source_hash || !data.source_path) {
      state = "untracked";
    } else if (!existsSync(join(projectRoot, data.source_path))) {
      state = "missing";
    } else if (hashFile(join(projectRoot, data.source_path)) !== data.source_hash) {
      state = "stale";
    } else {
      state = "current";
    }
    if (state === "stale" || state === "missing") driftedSlugs.add(slugify(title));
    sources.push({ title, rel, source_path: data.source_path, state });
  }

  const review: NoteStatus[] = [];
  for (const file of listPages(join(root, "notes"))) {
    const parsed = parseFrontmatter(readPage(join(root, "notes", file)));
    const title = (parsed.data as { title?: string }).title ?? file.replace(/\.md$/, "");
    const links = [...parsed.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => slugify(m[1]!.trim()));
    if (links.some((l) => driftedSlugs.has(l))) review.push({ title, rel: `notes/${file}` });
  }

  return { sources, review };
}

export function hasDrift(r: StatusReport): boolean {
  return r.sources.some((s) => s.state === "stale" || s.state === "missing");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/status.test.ts`
Expected: PASS (5 pass).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/status.ts plugins/ymir/wiki-cli/test/status.test.ts
git commit -m "feat(wiki-cli): computeStatus drift detection by content hash"
```

---

## Task 6: `src/commands/status.ts` + CLI `status` (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/commands/status.ts`
- Modify: `plugins/ymir/wiki-cli/src/cli.ts`
- Test: `plugins/ymir/wiki-cli/test/status.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `test/status.test.ts`:

```typescript
import { runStatus } from "../src/commands/status.js";

describe("runStatus", () => {
  it("exits 1 and emits json with stale source", async () => {
    const abs = await ingestFile("A", "src/a.ts", "v1");
    writeFileSync(abs, "v2");
    const r = runStatus(root, true);
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.out);
    expect(parsed.sources.find((s: { title: string }) => s.title === "A").state).toBe("stale");
  });

  it("exits 0 when all current", async () => {
    await ingestFile("A", "src/a.ts", "v1");
    expect(runStatus(root, false).code).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/status.test.ts`
Expected: FAIL — cannot find module `../src/commands/status.js`.

- [ ] **Step 3: Implement**

Create `src/commands/status.ts`:

```typescript
import { computeStatus, hasDrift, type StatusReport } from "../status.js";

export function formatStatus(r: StatusReport): string {
  const lines: string[] = [];
  const group = (state: string) =>
    r.sources.filter((s) => s.state === state).map((s) => `  - ${s.title} (${s.source_path ?? "?"})`);
  const stale = group("stale");
  const missing = group("missing");
  if (stale.length) lines.push("stale:", ...stale);
  if (missing.length) lines.push("missing:", ...missing);
  if (r.review.length) lines.push("review (notes on drifted sources):", ...r.review.map((n) => `  - ${n.title}`));
  if (!lines.length) return "wiki in sync\n";
  return `${lines.join("\n")}\n`;
}

export function runStatus(root: string, json: boolean): { out: string; code: number } {
  const r = computeStatus(root);
  const out = json ? `${JSON.stringify(r, null, 2)}\n` : formatStatus(r);
  return { out, code: hasDrift(r) ? 1 : 0 };
}
```

In `src/cli.ts`, add the import near the other command imports:

```typescript
import { runStatus } from "./commands/status.js";
```

Add this command block (place it after the `validate` command):

```typescript
program
  .command("status")
  .option("--json", "emit JSON")
  .action((opts: { json?: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const { out, code } = runStatus(root, Boolean(opts.json));
    process.stdout.write(out);
    if (code !== 0) process.exit(code);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/status.test.ts`
Expected: PASS (all status tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/commands/status.ts plugins/ymir/wiki-cli/src/cli.ts plugins/ymir/wiki-cli/test/status.test.ts
git commit -m "feat(wiki-cli): wiki status command (drift report, nonzero on drift)"
```

---

## Task 7: `src/reindex.ts` + CLI wiring (TDD)

**Files:**
- Create: `plugins/ymir/wiki-cli/src/reindex.ts`
- Modify: `plugins/ymir/wiki-cli/src/cli.ts`
- Test: `plugins/ymir/wiki-cli/test/reindex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/reindex.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { reindex } from "../src/reindex.js";

describe("reindex", () => {
  it("calls qmd collection add with derived name", () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const runner = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { status: 0 };
    };
    const r = reindex("/home/me/proj/wiki", runner);
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(false);
    expect(calls[0]!.cmd).toBe("qmd");
    expect(calls[0]!.args).toEqual(["collection", "add", "/home/me/proj/wiki", "--name", "proj-wiki"]);
  });

  it("returns skipped without throwing when qmd fails", () => {
    const runner = () => ({ status: 127 });
    const r = reindex("/home/me/proj/wiki", runner);
    expect(r.ok).toBe(false);
    expect(r.skipped).toBe(true);
  });

  it("returns skipped when runner throws (qmd absent)", () => {
    const runner = () => {
      throw new Error("ENOENT");
    };
    const r = reindex("/home/me/proj/wiki", runner);
    expect(r.skipped).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/reindex.test.ts`
Expected: FAIL — cannot find module `../src/reindex.js`.

- [ ] **Step 3: Implement**

Create `src/reindex.ts`:

```typescript
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";

export type ReindexRunner = (cmd: string, args: string[]) => { status: number | null };

const defaultRunner: ReindexRunner = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  return { status: r.status };
};

export interface ReindexResult {
  ok: boolean;
  skipped: boolean;
  name: string;
}

export function reindex(root: string, runner: ReindexRunner = defaultRunner): ReindexResult {
  const name = `${basename(resolve(root, ".."))}-wiki`;
  try {
    const r = runner("qmd", ["collection", "add", root, "--name", name]);
    if (r.status === 0) return { ok: true, skipped: false, name };
    return { ok: false, skipped: true, name };
  } catch {
    return { ok: false, skipped: true, name };
  }
}
```

In `src/cli.ts`, add the import:

```typescript
import { reindex } from "./reindex.js";
```

Add a helper near the top (after `readStdin`):

```typescript
const maybeReindex = (root: string, enabled: boolean) => {
  if (!enabled) return;
  const r = reindex(root);
  if (r.skipped) process.stderr.write(`[wiki] qmd reindex skipped (collection ${r.name})\n`);
};
```

Wire it into the **note** and **index** commands (the **ingest** command is rewritten in Task 8 and gets `--no-reindex` + `maybeReindex` there). For each, add `.option("--no-reindex")` and call `maybeReindex(root, opts.reindex !== false)` after the write. Example for `index`:

```typescript
program
  .command("index")
  .option("--no-reindex")
  .action(async (opts: { reindex?: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    writePage(wikiPaths(root).index, buildIndex(root));
    maybeReindex(root, opts.reindex !== false);
    process.stdout.write("rebuilt index.md\n");
  });
```

Add a standalone `reindex` command too:

```typescript
program
  .command("reindex")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    const r = reindex(root);
    process.stdout.write(r.skipped ? `qmd reindex skipped (${r.name})\n` : `reindexed ${r.name}\n`);
  });
```

> Note: commander's `--no-reindex` sets `opts.reindex` to `false`; absence leaves it `undefined`, so `opts.reindex !== false` defaults to reindexing.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/reindex.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Run the full suite (no qmd spawned in tests)**

Run: `bun test`
Expected: PASS — existing suite unaffected (write commands' reindex only runs through the CLI actions, not in `runIngest`/`runNote` units).

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/wiki-cli/src/reindex.ts plugins/ymir/wiki-cli/src/cli.ts plugins/ymir/wiki-cli/test/reindex.test.ts
git commit -m "feat(wiki-cli): best-effort qmd reindex on writes + reindex command"
```

---

## Task 8: `ingest --source` CLI flag + hashing (TDD)

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/cli.ts`
- Test: `plugins/ymir/wiki-cli/test/cli-ingest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/cli-ingest.test.ts` (drives the binary-equivalent path via `spawnSync` on the source entry using bun):

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFrontmatter } from "../src/frontmatter.js";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let proj: string;
beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "proj-"));
  mkdirSync(join(proj, "wiki", "sources"), { recursive: true });
  mkdirSync(join(proj, "wiki", "notes"), { recursive: true });
  mkdirSync(join(proj, "src"));
  writeFileSync(join(proj, "src", "a.ts"), "code v1");
});

it("ingest --source stores provenance for the real file", () => {
  const r = spawnSync("bun", [CLI, "--root", "./wiki", "ingest", "--source", "src/a.ts", "--title", "A", "--no-reindex"], {
    cwd: proj,
    input: "summary body",
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  const data = parseFrontmatter(readFileSync(join(proj, "wiki", "sources", "a.md"), "utf8")).data as {
    source_path?: string; source_hash?: string;
  };
  expect(data.source_path).toBe("src/a.ts");
  expect(data.source_hash).toMatch(/^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli-ingest.test.ts`
Expected: FAIL — `--source` not recognized / provenance not written.

- [ ] **Step 3: Implement**

In `src/cli.ts`, add imports:

```typescript
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileProvenance } from "./provenance.js";
```

Replace the existing `ingest` command with:

```typescript
program
  .command("ingest")
  .option("--raw <path>", "source file path (alias of --source)")
  .option("--source <path>", "downstream file this summary is derived from")
  .requiredOption("--title <title>")
  .option("--no-reindex")
  .action(async (opts: { raw?: string; source?: string; title: string; reindex?: boolean }) => {
    const root = program.opts<{ root: string }>().root;
    const input = opts.source ?? opts.raw;
    if (!input) {
      process.stderr.write("ingest requires --source <path>\n");
      process.exit(1);
    }
    const projectRoot = resolve(root, "..");
    const abs = resolve(process.cwd(), input);
    if (!existsSync(abs)) {
      process.stderr.write(`ingest: source file not found: ${input}\n`);
      process.exit(1);
    }
    const prov = fileProvenance(projectRoot, abs);
    const path = await runIngest({
      root,
      source: input,
      sourcePath: prov.sourcePath,
      sourceHash: prov.sourceHash,
      title: opts.title,
      body: readStdin(),
      today: today(),
    });
    maybeReindex(root, opts.reindex !== false);
    process.stdout.write(`wrote ${path}\n`);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli-ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/cli.ts plugins/ymir/wiki-cli/test/cli-ingest.test.ts
git commit -m "feat(wiki-cli): ingest --source records file provenance + hash"
```

---

## Task 9: SessionStart hook — surface drift

**Files:**
- Create: `plugins/ymir/hooks/wiki-sync-status.mjs`
- Modify: `plugins/ymir/hooks/hooks.json`

- [ ] **Step 1: Write the hook**

Create `plugins/ymir/hooks/wiki-sync-status.mjs`:

```javascript
#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = "wiki";
const bin = join(process.env.CLAUDE_PLUGIN_ROOT ?? "", "wiki-cli", "bin", "wiki");

if (!existsSync(root) || !existsSync(bin)) process.exit(0);

let report;
try {
  const r = spawnSync(bin, ["--root", root, "status", "--json"], { encoding: "utf8" });
  if (r.status === null) process.exit(0); // failed to spawn
  report = JSON.parse(r.stdout || "{}");
} catch {
  process.exit(0);
}

const drift = (report.sources ?? []).filter((s) => s.state === "stale" || s.state === "missing");
if (drift.length === 0) process.exit(0);

let msg = "[ymir] Wiki out of date. Re-ingest these to match current files:\n";
for (const s of drift) msg += `  - page "${s.title}"  ← ${s.source_path ?? "?"} (${s.state})\n`;
msg +=
  'For each: read the file, then run\n  wiki --root ./wiki ingest --source <path> --title "<page title>"\n';
process.stdout.write(msg);
process.exit(0);
```

- [ ] **Step 2: Register the hook**

Edit `plugins/ymir/hooks/hooks.json` to add a second SessionStart entry. Final content:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/ensure-wiki-binary.mjs\"",
            "timeout": 120
          },
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/wiki-sync-status.mjs\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Manual smoke (binary build required)**

Run:

```bash
cd plugins/ymir/wiki-cli && bun run build && bun build ./src/cli.ts --compile --target=bun-darwin-arm64 --outfile bin/wiki
cd /tmp && rm -rf hooktest && mkdir -p hooktest/proj/src && cd hooktest/proj
echo "v1" > src/a.ts
CLAUDE_PLUGIN_ROOT="$OLDPWD/../plugins/ymir" \
  "$OLDPWD/../plugins/ymir/wiki-cli/bin/wiki" --root ./wiki init
"$OLDPWD/../plugins/ymir/wiki-cli/bin/wiki" --root ./wiki ingest --source src/a.ts --title "A" --no-reindex <<< "summary"
echo "v2-changed" > src/a.ts
node "$OLDPWD/../plugins/ymir/hooks/wiki-sync-status.mjs"
```

Expected: prints the `[ymir] Wiki out of date ... page "A" ← src/a.ts (stale)` block.
(Adjust `CLAUDE_PLUGIN_ROOT`/paths to your checkout. This is a manual check; no committed test.)

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/hooks/wiki-sync-status.mjs plugins/ymir/hooks/hooks.json
git commit -m "feat(ymir): SessionStart hook surfaces stale wiki sources for re-ingest"
```

---

## Task 10: Document the workflow in `SCHEMA.md`

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/templates/wiki/SCHEMA.md`

- [ ] **Step 1: Update the command reference + add a sync section**

In `src/templates/wiki/SCHEMA.md`, update the `ingest` bullet and add `status`/`reindex` under "Key commands":

```markdown
- `ingest --source <path> --title <t>` (body on STDIN) — summarize a source and
  record its path + content hash for drift detection.
- `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
- `index` — rebuild the catalog.
- `status` — report which sources are stale/missing vs their downstream files
  (exit nonzero on drift).
- `reindex` — refresh the qmd search index (run automatically after writes).
- `validate` — structural health check (frontmatter, `[[links]]`, orphans).
- `query <q>` — search via qmd.
```

Add this section after "Operations":

```markdown
## Staying in sync
Source pages store the `source_path` + `source_hash` of the file they summarize.
When that file changes, `wiki status` marks the page **stale**; a SessionStart
hook surfaces stale pages each session so they can be re-ingested:

```
wiki --root ./wiki ingest --source <path> --title "<page title>"
```

Re-ingesting overwrites the page and refreshes the hash. Search stays current
because every write best-effort runs `qmd collection add` (the `reindex` step).
```

- [ ] **Step 2: Commit**

```bash
git add plugins/ymir/wiki-cli/src/templates/wiki/SCHEMA.md
git commit -m "docs(wiki-cli): document --source provenance, status, reindex in SCHEMA"
```

---

## Final verification

- [ ] **Run the full suite + typecheck**

Run (in `plugins/ymir/wiki-cli`):

```bash
bun test
bun run typecheck
```

Expected: all tests pass; `tsc --noEmit` clean.

- [ ] **Confirm no qmd is required for tests** — `bun test` must pass on a machine without qmd (reindex paths are runner-injected or `--no-reindex`).
