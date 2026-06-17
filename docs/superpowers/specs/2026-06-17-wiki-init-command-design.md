# Wiki `init` command — design

**Date:** 2026-06-17
**Branch:** `feat/wiki-init-cmd`

## Problem

The Ymir skill (`plugins/ymir/SKILL.md`) scaffolds a project's wiki/context
harness by **manually** copying template files, installing a hook, merging
`.claude/settings.json`, and appending a `CLAUDE.md` block. This contradicts the
design principle: **all wiki state changes go through the wiki CLI, never by
hand.** Scaffolding is the one place the skill still edits files directly.

## Goal

Move the entire wiki/context scaffold into a single CLI command, `wiki init`, so
the skill just runs the binary. The CLI becomes the single source of truth for
the wiki harness.

## Constraints

- The CLI ships as a **compiled standalone bun binary** (`wiki-cli/bin/wiki`),
  downloaded from GitHub releases by the SessionStart hook. It cannot rely on
  template files existing next to it on disk. Template content must be **baked
  into the binary**.
- Strong typing (no `any`/untyped maps). Settings merge operates on typed
  structures.
- Idempotent: re-running `init` must not clobber existing content.

## Command

```
wiki [--root <dir>] init [--project-root <dir>] [--name <project>]
```

- `--root <dir>` (global, existing) — wiki directory. Default `wiki`.
- `--project-root <dir>` — directory holding `.claude/` and `CLAUDE.md`.
  Default: current working directory.
- `--name <project>` — project name substituted into `SCHEMA.md`.
  Default: `basename(projectRoot)`.

### Behavior (idempotent)

1. **Wiki tree** under `--root`:
   - `raw/`, `sources/`, `notes/` — each with an empty `.gitkeep`.
   - `SCHEMA.md` — embedded template with `PROJECT_NAME` replaced by project name.
   - `index.md` — embedded index seed.
   - `log.md` — embedded log seed.
   - Each file written **only if it does not already exist**. Directories created
     idempotently.
2. **Hook**: write `.claude/hooks/block-wiki-edits.mjs` (embedded). This file is
   CLI-managed, so it is always (re)written to stay current.
3. **Settings merge**: read `.claude/settings.json` (or start from `{}`),
   append the `Write|Edit|MultiEdit` PreToolUse hook entry **only if an
   equivalent entry is not already present**, preserving all other hooks and
   keys. Write back pretty-printed JSON.
4. **CLAUDE.md**: append the wiki guidance block **only if its marker line is
   absent**. Create the file if missing.
5. **Validate**: run the existing `validateWiki` on `--root`. Print a summary of
   created/skipped items, then `wiki valid` (or surface validation errors and
   exit non-zero).

## Embedding (decision A)

Template content moves into `src/templates/` and is imported as text so
`bun build --compile` bakes it into the binary:

- `src/templates/wiki/SCHEMA.md`
- `src/templates/wiki/index.seed.md`
- `src/templates/wiki/log.seed.md`
- `src/templates/hooks/block-wiki-edits.mjs`

Imported via `import x from "./path" with { type: "text" }`. An ambient
declaration file (`src/templates/text-modules.d.ts`) declares `*.md` and `*.mjs`
as text modules so `tsc --noEmit` passes.

The settings hook entry and the `CLAUDE.md` block are represented as **typed TS
constants** (not raw files), because the settings entry must be deep-merged
programmatically and the CLAUDE.md block is matched by marker.

## Code units

- `src/templates/embedded.ts` — re-exports the embedded text assets plus typed
  `SETTINGS_HOOK_ENTRY` (PreToolUse matcher object) and `CLAUDE_BLOCK` (string
  with a stable marker line).
- `src/scaffold.ts` — pure, fs-free helpers:
  - `mergeSettings(existing, entry)` → new settings object; appends entry to
    `hooks.PreToolUse` only if not already present; preserves everything else.
  - `claudeBlockPresent(content)` → boolean (marker detection).
  - `appendClaudeBlock(content)` → content with block appended (handles trailing
    newline).
- `src/commands/init.ts` — `runInit({ projectRoot, root, name })` orchestrates
  directory creation, conditional file writes, hook write, settings merge,
  CLAUDE.md update, and validation. Returns a typed summary of actions.
- `src/cli.ts` — register the `init` subcommand wiring options to `runInit`.

### Types

```ts
type PreToolUseEntry = {
  matcher: string;
  hooks: { type: "command"; command: string }[];
};
type Settings = {
  hooks?: { PreToolUse?: PreToolUseEntry[]; [k: string]: unknown };
  [k: string]: unknown;
};
type InitSummary = {
  created: string[];   // paths newly written
  skipped: string[];   // paths left untouched (already existed)
  settingsMerged: boolean;
  claudeBlockAppended: boolean;
  valid: boolean;
};
```

## SKILL.md changes

Replace the manual wiki/context section (the 5 numbered steps copying templates,
installing the hook, merging settings, appending CLAUDE.md, then validating)
with a single instruction: run

```
${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki init
```

then surface the qmd one-time setup note. Reinforce the principle: the skill
never edits wiki/harness files directly — `wiki init` owns scaffolding.

## Cleanup

After embedding, delete the now-unused plugin template dirs once confirmed no
other consumer references them:

- `plugins/ymir/templates/wiki/`
- `plugins/ymir/templates/hooks/`

(Grep for references before deleting.)

## Testing (TDD)

Unit (pure, fs-free):

- `mergeSettings`: appends entry to empty settings; appends to settings with
  other PreToolUse entries; is idempotent (no duplicate on re-merge); preserves
  unrelated hooks and top-level keys.
- `claudeBlockPresent` / `appendClaudeBlock`: detects marker; appends when
  absent; no double-append.

Integration (tmp dir):

- `runInit` on an empty temp project → wiki tree exists, `validateWiki` returns
  ok, hook file written, `.claude/settings.json` contains the PreToolUse entry,
  `CLAUDE.md` contains the block.
- Re-run `runInit` → no duplicate settings entry, no duplicate CLAUDE.md block,
  existing wiki pages untouched (skipped), still valid.
- `--name` override appears in `SCHEMA.md`; default uses project-root basename.

## Out of scope

- Other harness concerns (lint, CI, rules) remain stubs in the skill.
- No change to existing `ingest`/`note`/`index`/`log`/`validate`/`fmt`/`query`.
