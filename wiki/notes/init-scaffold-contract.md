---
title: Init Scaffold Contract
type: concept
date: 2026-09-20
tags: []
source_count: 0
---

# Init Scaffold Contract

`wiki init [--project-root <dir>] [--name <project>]` is the single idempotent CLI call that lays down the entire wiki harness into a project — the Ymir SKILL must never copy templates or edit settings/CLAUDE.md by hand; every change to the wiki harness goes through the CLI.

What it creates, each write skipped if the target already exists (except the hook and the resolver shim, always rewritten to stay current):

* The wiki tree: `raw/`, `sources/`, `notes/` (each with a `.gitkeep`), `SCHEMA.md` (with `PROJECT_NAME` replaced by the project name — default `basename(projectRoot)`), `index.md`, and `log.md`, all seeded from templates.
* `<wiki root>/bin/wiki` — the repo-local resolver (mode 0755) that `SCHEMA.md` names. It searches `YMIR_WIKI_BIN`, `CLAUDE_PLUGIN_ROOT`, project-local and global skill installs, the plugin cache (newest version first), then `PATH`, and prints every location it tried when nothing is found.
* `.claude/hooks/block-wiki-edits.mjs` — the PreToolUse hook that blocks direct Write/Edit/MultiEdit on wiki docs; always (re)written since it is CLI-managed. Its deny message quotes the resolver invocation, so a blocked agent is told the command to run rather than sent to a document that may be stale.
* `.claude/settings.json` — deep-merged so the `Write|Edit|MultiEdit` PreToolUse hook entry is appended only if an equivalent entry isn't already present; all other hooks and keys are preserved.
* `CLAUDE.md` — the "Wiki / Context" guidance block is appended only if its marker heading is absent; the file is created if missing.

Everything written into the project is project-relative. An absolute path would name the scaffolding machine and its install layout, and `SCHEMA.md` is committed — that is how a wiki generated on one host came to document a CLI path no other checkout could resolve. Because `SCHEMA.md` already exists by the time such a repo re-runs `init`, the write-if-missing rule would strand it there, so `init` also repairs the generated invocation block in place and reports `updated SCHEMA.md CLI invocation`; the rest of the file, including anything the project added, is left alone.

Template content (`SCHEMA.md`, `index.seed.md`, `log.seed.md`, the resolver, the hook script) is baked into the compiled binary via `import x from "./path" with { type: "text" }`, because the CLI ships as a standalone `bun --compile` binary downloaded from GitHub Releases and cannot rely on template files existing on disk next to it.

On success, `init` runs `validateWiki` on the result and prints `wiki valid`; on failure it exits non-zero. Re-running `init` is safe — it reports `skipped` for anything already present rather than clobbering it.

See [[Wiki Schema]] for the rules the scaffolded wiki enforces, [[Ymir SKILL Dispatcher]] for how the wiki-only intent (`ymir add context`/`ymir add wiki`) invokes `wiki init` directly, [[Wiki CLI Command Surface]] for the full command reference this scaffold enables, and [[Wiki Harness Model]] for how this scaffold fits the three-layer wiki design.
