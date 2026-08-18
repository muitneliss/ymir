---
title: Init Scaffold Contract
type: concept
date: 2026-08-18
tags: []
source_count: 0
---

# Init Scaffold Contract

`wiki init [--project-root <dir>] [--name <project>]` is the single idempotent CLI call that lays down the entire wiki harness into a project — the Ymir SKILL must never copy templates or edit settings/CLAUDE.md by hand; every change to the wiki harness goes through the CLI.

What it creates, each write skipped if the target already exists (except the hook, always rewritten to stay current):

* The wiki tree: `raw/`, `sources/`, `notes/` (each with a `.gitkeep`), `SCHEMA.md` (with `PROJECT_NAME` replaced by the project name — default `basename(projectRoot)`), `index.md`, and `log.md`, all seeded from templates.
* `.claude/hooks/block-wiki-edits.mjs` — the PreToolUse hook that blocks direct Write/Edit/MultiEdit on wiki docs; always (re)written since it is CLI-managed.
* `.claude/settings.json` — deep-merged so the `Write|Edit|MultiEdit` PreToolUse hook entry is appended only if an equivalent entry isn't already present; all other hooks and keys are preserved.
* `CLAUDE.md` — the "Wiki / Context" guidance block is appended only if its marker heading is absent; the file is created if missing.

Template content (`SCHEMA.md`, `index.seed.md`, `log.seed.md`, the hook script) is baked into the compiled binary via `import x from "./path" with { type: "text" }`, because the CLI ships as a standalone `bun --compile` binary downloaded from GitHub Releases and cannot rely on template files existing on disk next to it.

On success, `init` runs `validateWiki` on the result and prints `wiki valid`; on failure it exits non-zero. Re-running `init` is safe — it reports `skipped` for anything already present rather than clobbering it.

See [[Wiki Schema]] for the rules the scaffolded wiki enforces, [[Ymir SKILL Dispatcher]] for how the wiki-only intent (`ymir add context`/`ymir add wiki`) invokes `wiki init` directly, [[Wiki CLI Command Surface]] for the full command reference this scaffold enables, and [[Wiki Harness Model]] for how this scaffold fits the three-layer wiki design.
