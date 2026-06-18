---
title: Init Scaffold Contract
type: concept
date: 2026-06-17
tags: []
source_count: 0
---

# Init Scaffold Contract

`wiki init` is the single idempotent CLI call that lays down the entire wiki harness into a project — the SKILL must never copy templates or edit settings/CLAUDE.md by hand. On success its last line is `wiki valid`; if it errors, the caller stops and reports.

What it creates (write-if-missing, so re-runs are safe): the wiki tree `raw/`, `sources/`, `notes/` (each with `.gitkeep`), `SCHEMA.md` (with PROJECT\_NAME rendered to the project basename), seeded `index.md` and `log.md`. It also installs the PreToolUse hook `.claude/hooks/block-wiki-edits.mjs`, merges a hook entry into `.claude/settings.json` (merge, never clobber), and appends the wiki pointer block to `CLAUDE.md`. Finally it runs `validate` and reports created/skipped paths plus whether settings were merged and the CLAUDE.md block appended.

The hook denies direct Write/Edit/MultiEdit on `wiki/sources/`, `wiki/notes/`, `wiki/index.md`, and `wiki/log.md`, while allowing `wiki/raw/**` and `wiki/SCHEMA.md`. This is the scaffold half of the harness: it establishes the structure and enforcement, after which [[Wiki Schema]] plus the CLI drive ingest/query/lint. See [[Ymir SKILL Dispatcher]] for how the dispatcher invokes it, [[Wiki CLI Command Surface]] for the command, and [[Wiki Harness Model]] for the model.
