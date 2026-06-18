# Wiki `init` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ymir SKILL's manual wiki/context scaffolding with a single self-contained CLI command, `wiki init`.

**Architecture:** Templates move into `src/templates/` and are baked into the bun-compiled binary as text imports. A new `runInit()` orchestrates idempotent fs writes (wiki tree, PreToolUse hook, deep-merged `.claude/settings.json`, `CLAUDE.md` block) and runs `validateWiki`. Pure helpers (`mergeSettings`, `claudeBlockPresent`, `appendClaudeBlock`) are unit-tested in isolation; `runInit` has an integration test against a tmp dir. SKILL.md is rewritten to call the binary, and the old `plugins/ymir/templates/` dir is deleted.

**Tech Stack:** TypeScript + bun (test runner + builder), commander, existing `validateWiki`. No new deps.

---

## File Structure

**Create:**
- `plugins/ymir/wiki-cli/src/templates/wiki/SCHEMA.md` (moved from `plugins/ymir/templates/wiki/SCHEMA.md`)
- `plugins/ymir/wiki-cli/src/templates/wiki/index.seed.md` (moved from `plugins/ymir/templates/wiki/index.seed.md`)
- `plugins/ymir/wiki-cli/src/templates/wiki/log.seed.md` (moved from `plugins/ymir/templates/wiki/log.seed.md`)
- `plugins/ymir/wiki-cli/src/templates/hooks/block-wiki-edits.mjs` (moved from `plugins/ymir/templates/hooks/block-wiki-edits.mjs`)
- `plugins/ymir/wiki-cli/src/templates/text-modules.d.ts` (ambient module decls so `tsc` accepts `*.md`/`*.mjs` text imports)
- `plugins/ymir/wiki-cli/src/templates/embedded.ts` (re-exports embedded text + typed `SETTINGS_HOOK_ENTRY`)
- `plugins/ymir/wiki-cli/src/scaffold.ts` (pure helpers + `CLAUDE_BLOCK` constant)
- `plugins/ymir/wiki-cli/src/commands/init.ts` (`runInit` orchestration)
- `plugins/ymir/wiki-cli/test/mergeSettings.test.ts`
- `plugins/ymir/wiki-cli/test/claudeBlock.test.ts`
- `plugins/ymir/wiki-cli/test/init.test.ts`

**Modify:**
- `plugins/ymir/wiki-cli/src/cli.ts` (register `init` subcommand)
- `plugins/ymir/SKILL.md` (drop manual steps, call `wiki init`)
- `plugins/ymir/wiki-cli/test/scaffold.test.ts` (delete — superseded by `init.test.ts`)

**Delete:**
- `plugins/ymir/templates/wiki/` (after embed)
- `plugins/ymir/templates/hooks/` (after embed)

---

## Task 1: Move templates into `src/templates/` + ambient text-module decls

**Files:**
- Create: `plugins/ymir/wiki-cli/src/templates/wiki/SCHEMA.md`
- Create: `plugins/ymir/wiki-cli/src/templates/wiki/index.seed.md`
- Create: `plugins/ymir/wiki-cli/src/templates/wiki/log.seed.md`
- Create: `plugins/ymir/wiki-cli/src/templates/hooks/block-wiki-edits.mjs`
- Create: `plugins/ymir/wiki-cli/src/templates/text-modules.d.ts`

- [ ] **Step 1: Copy templates into src/templates/**

```bash
cd plugins/ymir/wiki-cli
mkdir -p src/templates/wiki src/templates/hooks
cp ../templates/wiki/SCHEMA.md       src/templates/wiki/SCHEMA.md
cp ../templates/wiki/index.seed.md   src/templates/wiki/index.seed.md
cp ../templates/wiki/log.seed.md     src/templates/wiki/log.seed.md
cp ../templates/hooks/block-wiki-edits.mjs src/templates/hooks/block-wiki-edits.mjs
```

- [ ] **Step 2: Add ambient text-module declarations**

Create `plugins/ymir/wiki-cli/src/templates/text-modules.d.ts`:

```ts
declare module "*.md" {
  const content: string;
  export default content;
}
declare module "*.mjs" {
  const content: string;
  export default content;
}
```

- [ ] **Step 3: Run typecheck to confirm decls valid**

```bash
cd plugins/ymir/wiki-cli && bun run typecheck
```
Expected: exit 0 (no errors).

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/wiki-cli/src/templates
git commit -m "chore(wiki-cli): vendor templates into src/templates for embedding"
```

---

## Task 2: Embedded assets module

**Files:**
- Create: `plugins/ymir/wiki-cli/src/templates/embedded.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/ymir/wiki-cli/test/embedded.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK, SETTINGS_HOOK_ENTRY,
} from "../src/templates/embedded.js";

describe("embedded templates", () => {
  it("SCHEMA contains PROJECT_NAME placeholder", () => {
    expect(SCHEMA_TPL).toContain("PROJECT_NAME");
  });
  it("INDEX_SEED has Wiki Index heading", () => {
    expect(INDEX_SEED).toContain("# Wiki Index");
  });
  it("LOG_SEED has Wiki Log heading", () => {
    expect(LOG_SEED).toContain("# Wiki Log");
  });
  it("BLOCK_HOOK is the node hook script", () => {
    expect(BLOCK_HOOK).toContain("hookSpecificOutput");
    expect(BLOCK_HOOK).toContain("PreToolUse");
  });
  it("SETTINGS_HOOK_ENTRY targets Write|Edit|MultiEdit", () => {
    expect(SETTINGS_HOOK_ENTRY.matcher).toBe("Write|Edit|MultiEdit");
    expect(SETTINGS_HOOK_ENTRY.hooks[0].command).toContain(
      ".claude/hooks/block-wiki-edits.mjs",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd plugins/ymir/wiki-cli && bun test test/embedded.test.ts
```
Expected: FAIL — module `../src/templates/embedded.js` not found.

- [ ] **Step 3: Write `embedded.ts`**

Create `plugins/ymir/wiki-cli/src/templates/embedded.ts`:

```ts
import SCHEMA_TPL from "./wiki/SCHEMA.md" with { type: "text" };
import INDEX_SEED from "./wiki/index.seed.md" with { type: "text" };
import LOG_SEED from "./wiki/log.seed.md" with { type: "text" };
import BLOCK_HOOK from "./hooks/block-wiki-edits.mjs" with { type: "text" };

export { SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK };

export type HookCmd = { type: "command"; command: string };
export type PreToolUseEntry = { matcher: string; hooks: HookCmd[] };

export const SETTINGS_HOOK_ENTRY: PreToolUseEntry = {
  matcher: "Write|Edit|MultiEdit",
  hooks: [
    {
      type: "command",
      command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-wiki-edits.mjs"',
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes + typecheck**

```bash
cd plugins/ymir/wiki-cli && bun test test/embedded.test.ts && bun run typecheck
```
Expected: PASS (5 expects), typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/templates/embedded.ts plugins/ymir/wiki-cli/test/embedded.test.ts
git commit -m "feat(wiki-cli): embed wiki/hook templates into binary"
```

---

## Task 3: `mergeSettings` pure helper

**Files:**
- Create: `plugins/ymir/wiki-cli/src/scaffold.ts`
- Test: `plugins/ymir/wiki-cli/test/mergeSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/ymir/wiki-cli/test/mergeSettings.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { mergeSettings, type Settings } from "../src/scaffold.js";
import { SETTINGS_HOOK_ENTRY } from "../src/templates/embedded.js";

describe("mergeSettings", () => {
  it("adds the entry to empty settings", () => {
    const out = mergeSettings({}, SETTINGS_HOOK_ENTRY);
    expect(out.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });

  it("appends to existing PreToolUse without duplicating", () => {
    const other = {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "echo hi" }],
    };
    const start: Settings = { hooks: { PreToolUse: [other] } };
    const out = mergeSettings(start, SETTINGS_HOOK_ENTRY);
    expect(out.hooks?.PreToolUse).toEqual([other, SETTINGS_HOOK_ENTRY]);
  });

  it("is idempotent on re-merge", () => {
    const once = mergeSettings({}, SETTINGS_HOOK_ENTRY);
    const twice = mergeSettings(once, SETTINGS_HOOK_ENTRY);
    expect(twice.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });

  it("preserves unrelated hooks namespaces and top-level keys", () => {
    const start: Settings = {
      hooks: { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "x" }] }] },
      otherKey: 42,
    };
    const out = mergeSettings(start, SETTINGS_HOOK_ENTRY);
    expect(out.otherKey).toBe(42);
    expect(out.hooks?.SessionStart).toEqual(start.hooks!.SessionStart);
    expect(out.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd plugins/ymir/wiki-cli && bun test test/mergeSettings.test.ts
```
Expected: FAIL — `../src/scaffold.js` not found.

- [ ] **Step 3: Write `scaffold.ts` (mergeSettings only for now)**

Create `plugins/ymir/wiki-cli/src/scaffold.ts`:

```ts
import type { PreToolUseEntry } from "./templates/embedded.js";

export type Settings = {
  hooks?: {
    PreToolUse?: PreToolUseEntry[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

function entriesEqual(a: PreToolUseEntry, b: PreToolUseEntry): boolean {
  if (a.matcher !== b.matcher) return false;
  if (a.hooks.length !== b.hooks.length) return false;
  return a.hooks.every(
    (h, i) => h.type === b.hooks[i].type && h.command === b.hooks[i].command,
  );
}

export function mergeSettings(
  existing: Settings,
  entry: PreToolUseEntry,
): Settings {
  const nextHooks = { ...(existing.hooks ?? {}) };
  const list: PreToolUseEntry[] = Array.isArray(nextHooks.PreToolUse)
    ? [...nextHooks.PreToolUse]
    : [];
  if (!list.some((e) => entriesEqual(e, entry))) list.push(entry);
  nextHooks.PreToolUse = list;
  return { ...existing, hooks: nextHooks };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd plugins/ymir/wiki-cli && bun test test/mergeSettings.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/scaffold.ts plugins/ymir/wiki-cli/test/mergeSettings.test.ts
git commit -m "feat(wiki-cli): mergeSettings helper for idempotent PreToolUse merge"
```

---

## Task 4: CLAUDE.md block helpers

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/scaffold.ts` (add `CLAUDE_BLOCK`, `claudeBlockPresent`, `appendClaudeBlock`)
- Test: `plugins/ymir/wiki-cli/test/claudeBlock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/ymir/wiki-cli/test/claudeBlock.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  CLAUDE_BLOCK, claudeBlockPresent, appendClaudeBlock,
} from "../src/scaffold.js";

describe("CLAUDE_BLOCK", () => {
  it("starts with the marker heading", () => {
    expect(CLAUDE_BLOCK.startsWith("## Wiki / Context")).toBe(true);
  });
});

describe("claudeBlockPresent", () => {
  it("false on empty", () => {
    expect(claudeBlockPresent("")).toBe(false);
  });
  it("false when marker absent", () => {
    expect(claudeBlockPresent("# Hello\nsome text")).toBe(false);
  });
  it("true when marker present", () => {
    expect(claudeBlockPresent("# Hi\n\n## Wiki / Context\nbody")).toBe(true);
  });
});

describe("appendClaudeBlock", () => {
  it("creates from empty", () => {
    const out = appendClaudeBlock("");
    expect(out).toBe(CLAUDE_BLOCK);
  });
  it("appends with blank-line separator when missing", () => {
    const out = appendClaudeBlock("# Project\nstuff\n");
    expect(out.endsWith(CLAUDE_BLOCK)).toBe(true);
    expect(out).toContain("# Project\nstuff\n\n## Wiki / Context");
  });
  it("does not double-append", () => {
    const once = appendClaudeBlock("# P\n");
    const twice = appendClaudeBlock(once);
    expect(twice).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd plugins/ymir/wiki-cli && bun test test/claudeBlock.test.ts
```
Expected: FAIL — `CLAUDE_BLOCK`/`claudeBlockPresent`/`appendClaudeBlock` not exported.

- [ ] **Step 3: Extend `scaffold.ts`**

Append to `plugins/ymir/wiki-cli/src/scaffold.ts`:

```ts
const CLAUDE_MARKER = "## Wiki / Context";

export const CLAUDE_BLOCK = `## Wiki / Context
This project has an LLM-maintained wiki under \`wiki/\`. You MUST NOT hand-edit
wiki docs (\`wiki/sources\`, \`wiki/notes\`, \`index.md\`, \`log.md\`) — they are
managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
\`wiki/SCHEMA.md\` for the rules and command reference.
`;

export function claudeBlockPresent(content: string): boolean {
  return content.split("\n").some((line) => line.trim() === CLAUDE_MARKER);
}

export function appendClaudeBlock(content: string): string {
  if (claudeBlockPresent(content)) return content;
  if (content.length === 0) return CLAUDE_BLOCK;
  const trailing = content.endsWith("\n") ? "" : "\n";
  return `${content}${trailing}\n${CLAUDE_BLOCK}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd plugins/ymir/wiki-cli && bun test test/claudeBlock.test.ts
```
Expected: PASS (7 expects across 7 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/ymir/wiki-cli/src/scaffold.ts plugins/ymir/wiki-cli/test/claudeBlock.test.ts
git commit -m "feat(wiki-cli): CLAUDE.md block helpers with idempotent append"
```

---

## Task 5: `runInit` orchestration

**Files:**
- Create: `plugins/ymir/wiki-cli/src/commands/init.ts`
- Test: `plugins/ymir/wiki-cli/test/init.test.ts`
- Delete: `plugins/ymir/wiki-cli/test/scaffold.test.ts` (superseded)

- [ ] **Step 1: Write the failing integration test**

Create `plugins/ymir/wiki-cli/test/init.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { runInit } from "../src/commands/init.js";
import { SETTINGS_HOOK_ENTRY } from "../src/templates/embedded.js";

let proj: string;
beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "init-")); });

describe("runInit", () => {
  it("scaffolds a valid wiki + hook + settings + CLAUDE.md", () => {
    const s = runInit({ projectRoot: proj, root: "wiki" });
    expect(s.valid).toBe(true);

    const wiki = join(proj, "wiki");
    for (const f of ["raw/.gitkeep", "sources/.gitkeep", "notes/.gitkeep", "SCHEMA.md", "index.md", "log.md"]) {
      expect(existsSync(join(wiki, f))).toBe(true);
    }
    const schema = readFileSync(join(wiki, "SCHEMA.md"), "utf8");
    expect(schema).not.toContain("PROJECT_NAME");
    expect(schema).toContain(basename(proj));

    expect(existsSync(join(proj, ".claude/hooks/block-wiki-edits.mjs"))).toBe(true);

    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);

    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude).toContain("## Wiki / Context");
    expect(s.claudeBlockAppended).toBe(true);
    expect(s.settingsMerged).toBe(true);
  });

  it("is idempotent: re-running does not duplicate or clobber", () => {
    runInit({ projectRoot: proj, root: "wiki" });
    writeFileSync(join(proj, "wiki/notes/keep.md"), "# keep");
    const s = runInit({ projectRoot: proj, root: "wiki" });

    expect(readFileSync(join(proj, "wiki/notes/keep.md"), "utf8")).toBe("# keep");
    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude.match(/## Wiki \/ Context/g)?.length).toBe(1);
    expect(s.settingsMerged).toBe(false);
    expect(s.claudeBlockAppended).toBe(false);
  });

  it("respects --name override", () => {
    runInit({ projectRoot: proj, root: "wiki", name: "custom-proj" });
    const schema = readFileSync(join(proj, "wiki/SCHEMA.md"), "utf8");
    expect(schema).toContain("custom-proj");
  });

  it("preserves existing CLAUDE.md content and unrelated settings hooks", () => {
    writeFileSync(join(proj, "CLAUDE.md"), "# Project\nexisting body\n");
    mkdirSync(join(proj, ".claude"), { recursive: true });
    writeFileSync(
      join(proj, ".claude/settings.json"),
      JSON.stringify({
        hooks: { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "x" }] }] },
      }),
    );
    runInit({ projectRoot: proj, root: "wiki" });
    const claude = readFileSync(join(proj, "CLAUDE.md"), "utf8");
    expect(claude).toContain("# Project\nexisting body");
    expect(claude).toContain("## Wiki / Context");
    const settings = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toBeDefined();
    expect(settings.hooks.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd plugins/ymir/wiki-cli && bun test test/init.test.ts
```
Expected: FAIL — `runInit` not found.

- [ ] **Step 3: Implement `runInit`**

Create `plugins/ymir/wiki-cli/src/commands/init.ts`:

```ts
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { validateWiki } from "../validate.js";
import {
  SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK, SETTINGS_HOOK_ENTRY,
} from "../templates/embedded.js";
import {
  mergeSettings, appendClaudeBlock, claudeBlockPresent,
  type Settings,
} from "../scaffold.js";

export type InitSummary = {
  created: string[];
  skipped: string[];
  settingsMerged: boolean;
  claudeBlockAppended: boolean;
  valid: boolean;
};

export function runInit(opts: {
  projectRoot: string;
  root: string;
  name?: string;
}): InitSummary {
  const projectRoot = resolve(opts.projectRoot);
  const wikiRoot = resolve(projectRoot, opts.root);
  const name = opts.name ?? basename(projectRoot);

  const created: string[] = [];
  const skipped: string[] = [];

  const writeIfMissing = (path: string, body: string) => {
    if (existsSync(path)) { skipped.push(path); return; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    created.push(path);
  };

  for (const d of ["raw", "sources", "notes"]) {
    writeIfMissing(join(wikiRoot, d, ".gitkeep"), "");
  }
  writeIfMissing(
    join(wikiRoot, "SCHEMA.md"),
    SCHEMA_TPL.replaceAll("PROJECT_NAME", name),
  );
  writeIfMissing(join(wikiRoot, "index.md"), INDEX_SEED);
  writeIfMissing(join(wikiRoot, "log.md"), LOG_SEED);

  const hookPath = join(projectRoot, ".claude", "hooks", "block-wiki-edits.mjs");
  const hookExisted = existsSync(hookPath);
  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, BLOCK_HOOK);
  (hookExisted ? skipped : created).push(hookPath);

  const settingsPath = join(projectRoot, ".claude", "settings.json");
  const existing: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings)
    : {};
  const beforeCount = existing.hooks?.PreToolUse?.length ?? 0;
  const merged = mergeSettings(existing, SETTINGS_HOOK_ENTRY);
  const afterCount = merged.hooks?.PreToolUse?.length ?? 0;
  const settingsMerged = afterCount !== beforeCount;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);

  const claudePath = join(projectRoot, "CLAUDE.md");
  const claudeContent = existsSync(claudePath)
    ? readFileSync(claudePath, "utf8")
    : "";
  const claudeBlockAppended = !claudeBlockPresent(claudeContent);
  writeFileSync(claudePath, appendClaudeBlock(claudeContent));

  const v = validateWiki(wikiRoot);
  return {
    created,
    skipped,
    settingsMerged,
    claudeBlockAppended,
    valid: v.ok,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd plugins/ymir/wiki-cli && bun test test/init.test.ts
```
Expected: PASS (all 4 tests).

- [ ] **Step 5: Delete superseded scaffold test**

```bash
cd plugins/ymir/wiki-cli && rm test/scaffold.test.ts
```

- [ ] **Step 6: Run the full test suite**

```bash
cd plugins/ymir/wiki-cli && bun test
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/ymir/wiki-cli/src/commands/init.ts plugins/ymir/wiki-cli/test/init.test.ts
git rm plugins/ymir/wiki-cli/test/scaffold.test.ts
git commit -m "feat(wiki-cli): runInit scaffolds full wiki harness idempotently"
```

---

## Task 6: Register `init` subcommand in CLI

**Files:**
- Modify: `plugins/ymir/wiki-cli/src/cli.ts`

- [ ] **Step 1: Add the subcommand**

In `plugins/ymir/wiki-cli/src/cli.ts`, add the import near the other command imports:

```ts
import { runInit } from "./commands/init.js";
```

Then add the subcommand registration before `program.parseAsync();`:

```ts
program
  .command("init")
  .option("--project-root <dir>", "project root", process.cwd())
  .option("--name <name>", "project name (defaults to basename of project root)")
  .action((opts: { projectRoot: string; name?: string }) => {
    const root = program.opts<{ root: string }>().root;
    const s = runInit({ projectRoot: opts.projectRoot, root, name: opts.name });
    for (const p of s.created) process.stdout.write(`created ${p}\n`);
    for (const p of s.skipped) process.stdout.write(`skipped ${p}\n`);
    process.stdout.write(
      s.settingsMerged ? "settings merged\n" : "settings unchanged\n",
    );
    process.stdout.write(
      s.claudeBlockAppended ? "CLAUDE.md appended\n" : "CLAUDE.md unchanged\n",
    );
    if (!s.valid) {
      process.stderr.write("wiki invalid\n");
      process.exit(1);
    }
    process.stdout.write("wiki valid\n");
  });
```

- [ ] **Step 2: Build and smoke-test on a tmp dir**

```bash
cd plugins/ymir/wiki-cli
bun run build
TMP=$(mktemp -d)
node dist/cli.js --root wiki init --project-root "$TMP"
ls -R "$TMP"
node dist/cli.js --root wiki --project-root "$TMP" || true
# re-run for idempotency:
node dist/cli.js --root wiki init --project-root "$TMP"
```

Expected: first run prints `created …` lines, `settings merged`, `CLAUDE.md appended`, `wiki valid`. Second run prints `skipped …` lines, `settings unchanged`, `CLAUDE.md unchanged`, `wiki valid`. `ls -R "$TMP"` shows `wiki/`, `.claude/hooks/`, `.claude/settings.json`, `CLAUDE.md`.

- [ ] **Step 3: Typecheck**

```bash
cd plugins/ymir/wiki-cli && bun run typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/wiki-cli/src/cli.ts
git commit -m "feat(wiki-cli): register init subcommand"
```

---

## Task 7: Update SKILL.md — call CLI instead of doing it manually

**Files:**
- Modify: `plugins/ymir/SKILL.md`

- [ ] **Step 1: Replace the wiki/context section**

Open `plugins/ymir/SKILL.md`. Replace the entire `### wiki / context` subsection (currently containing the numbered steps 1–5 for creating the tree, installing the hook, merging settings, appending CLAUDE.md, validating, and the qmd note) with:

```markdown
### wiki / context

Triggered by intents like `ymir add context`, `ymir add wiki`, or as part of
`ymir init`. The wiki harness is scaffolded by **a single CLI call** — never by
hand-editing files. The CLI owns the tree, the hook, the settings entry, the
`CLAUDE.md` block, and the validation step.

Run, from the project root:

```bash
"${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki" --root ./wiki init
```

It is idempotent — safe to re-run. On success the last line is `wiki valid`.
If it errors, stop and report.

Then tell the user the qmd one-time setup (also documented in `wiki/SCHEMA.md`):

```bash
qmd collection add ./wiki --name <project>-wiki && qmd embed
```

**Design principle:** every change to the wiki harness goes through the wiki
CLI. The skill must never copy templates, edit `.claude/settings.json`, or
append to `CLAUDE.md` directly.
```

- [ ] **Step 2: Verify nothing else references the old templates path**

```bash
cd /Users/cuongtran/Kanna/ymir && grep -RIn "templates/wiki\|templates/hooks" --include='*.md' --include='*.ts' --include='*.mjs' --include='*.json' --include='*.js' plugins/ymir docs .github
```
Expected: matches only inside `plugins/ymir/wiki-cli/src/templates/` (the new in-src location) — no references to the old `plugins/ymir/templates/` path remain.

- [ ] **Step 3: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "docs(ymir): SKILL calls wiki init instead of scaffolding manually"
```

---

## Task 8: Delete obsolete `plugins/ymir/templates/` dir

**Files:**
- Delete: `plugins/ymir/templates/wiki/`
- Delete: `plugins/ymir/templates/hooks/`

- [ ] **Step 1: Confirm no remaining references**

```bash
cd /Users/cuongtran/Kanna/ymir && grep -RIn "plugins/ymir/templates" --include='*.md' --include='*.ts' --include='*.mjs' --include='*.json' --include='*.js' .
```
Expected: no results.

- [ ] **Step 2: Remove the directory**

```bash
cd /Users/cuongtran/Kanna/ymir && git rm -r plugins/ymir/templates
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(ymir): remove obsolete templates dir (now embedded in CLI)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full test + typecheck**

```bash
cd plugins/ymir/wiki-cli && bun test && bun run typecheck
```
Expected: all tests PASS (existing 45 + new ~12), typecheck exit 0.

- [ ] **Step 2: Build the binary**

```bash
cd plugins/ymir/wiki-cli && bun run build
```
Expected: `dist/cli.js` written.

- [ ] **Step 3: End-to-end manual init on a throwaway dir**

```bash
TMP=$(mktemp -d)
node plugins/ymir/wiki-cli/dist/cli.js --root wiki init --project-root "$TMP"
node plugins/ymir/wiki-cli/dist/cli.js --root wiki --project-root "$TMP" 2>/dev/null || true
node plugins/ymir/wiki-cli/dist/cli.js --root "$TMP/wiki" validate
grep -q "## Wiki / Context" "$TMP/CLAUDE.md" && echo "claude ok"
grep -q "block-wiki-edits.mjs" "$TMP/.claude/settings.json" && echo "settings ok"
```
Expected: `wiki valid`, `claude ok`, `settings ok`.

- [ ] **Step 4: Compile platform binary smoke test (optional, mac only)**

```bash
cd plugins/ymir/wiki-cli && bun run compile:darwin-arm64 && ls -lh dist/wiki-darwin-arm64
TMP=$(mktemp -d)
./dist/wiki-darwin-arm64 --root wiki init --project-root "$TMP" && echo "compiled binary ok"
```
Expected: `wiki valid`, `compiled binary ok`. Confirms templates are embedded into the standalone binary.

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin feat/wiki-init-cmd
gh pr create --title "feat(wiki-cli): wiki init command replaces manual SKILL scaffold" --body "$(cat <<'EOF'
## Summary
- New `wiki init` subcommand scaffolds the full project wiki harness in one idempotent call: wiki tree, PreToolUse hook, `.claude/settings.json` merge, `CLAUDE.md` block, then `validate`.
- Templates are now embedded in the compiled binary via text imports, removing the dependency on on-disk template files.
- `plugins/ymir/SKILL.md` rewritten: it now calls `wiki init` instead of copying templates and editing settings by hand. Reinforces the design principle: every wiki/harness change goes through the CLI.
- Obsolete `plugins/ymir/templates/` dir deleted.

Spec: `docs/superpowers/specs/2026-06-17-wiki-init-command-design.md`
Plan: `docs/superpowers/plans/2026-06-17-wiki-init-command.md`

## Test plan
- [x] `mergeSettings` unit tests (empty, append, idempotent, preserves unrelated)
- [x] CLAUDE.md block helpers unit tests (presence detection, no double-append)
- [x] `runInit` integration tests (creates valid wiki, idempotent re-run, `--name` override, preserves existing content)
- [x] `bun run typecheck`
- [x] End-to-end manual init on tmp dir produces `wiki valid`
- [ ] Compiled `wiki-darwin-arm64` runs `init` standalone (templates embedded)
EOF
)"
```

Expected: PR opened, URL printed.

---

## Self-Review Checklist (run before handing off)

1. **Spec coverage** — every section of `docs/superpowers/specs/2026-06-17-wiki-init-command-design.md` mapped to a task:
   - Command signature → Task 6
   - Wiki tree / hook / settings / CLAUDE.md / validate → Task 5 (+ Tasks 3, 4 for helpers)
   - Embedding decision A → Tasks 1, 2
   - Code units (`embedded.ts`, `scaffold.ts`, `commands/init.ts`, `cli.ts`) → Tasks 2, 3, 4, 5, 6
   - Types (`PreToolUseEntry`, `Settings`, `InitSummary`) → Tasks 2, 3, 5
   - SKILL.md changes → Task 7
   - Cleanup of old `templates/` → Task 8
   - Tests (unit + integration + idempotent + `--name`) → Tasks 3, 4, 5
   - Out of scope respected: no other harness concerns touched.
2. **Placeholder scan** — no TBD/TODO; every code step shows complete code; commands have expected output.
3. **Type consistency** — `PreToolUseEntry`, `Settings`, `HookCmd`, `InitSummary`, `SETTINGS_HOOK_ENTRY` all referenced with identical shape across tasks.
