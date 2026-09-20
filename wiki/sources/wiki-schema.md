---
title: Wiki Schema
type: source
date: 2026-09-20
tags: []
source: wiki/SCHEMA.md
source_path: wiki/SCHEMA.md
source_hash: 08dbcf9b13a177f9d6ec0a449bc0b8417575c817420cdd5eee63033633c62f15
ingested: 2026-09-20
---

# Wiki Schema

The in-wiki rules and command reference for this project's LLM-maintained wiki.

The LLM never hand-writes or hand-edits wiki documents. All writes go through the
Ymir wiki CLI, which formats and validates every change; a PreToolUse hook blocks
direct edits to `sources/`, `notes/`, `index.md` and `log.md`. Layers are `raw/`
for external material not tracked elsewhere in the repo, `sources/` for one
CLI-written summary per ingested file, `notes/` for synthesis pages, plus the
CLI-rebuilt `index.md` and CLI-appended `log.md`.

The CLI is invoked through `./wiki/bin/wiki --root ./wiki <command>` — the
repo-local resolver committed alongside the wiki. It locates the binary at run
time across skill install, plugin cache and `PATH`, so the one invocation this
tracked file documents resolves in every checkout rather than only on the machine
that scaffolded the wiki; `YMIR_WIKI_BIN` overrides the search. Because the
command list describes the version that scaffolded the wiki, an `unknown command`
means the installed binary is older than this document — `help` reports what the
binary at hand actually supports.

The command reference covers `init`, `ingest` (tracked via `--source` with a
recorded `source_path` and `source_hash`, or legacy `--raw`), `note`, `index`,
`log`, `check` as the single CI gate, `validate`, `status`, `coverage`, `remove`,
`rename`, `reindex`, `query` and `fmt`. It also documents `report`, which reviews
and files Ymir self-reports: command crashes are captured automatically to
`~/.ymir/`, `report` with no flags prints the exact issue text and sends nothing,
`--yes` files pending reports and opts in to automatic filing, and `--skill`
records a failure of the skill flow the CLI cannot observe itself. Reports are
redacted before storage and disabled by `--off`, `DO_NOT_TRACK=1`,
`DISABLE_TELEMETRY=1` or `YMIR_REPORT=off`.

Beyond commands it specifies page conventions and `[[Exact Title]]` linking,
declarative source coverage via `wiki/tracked.yaml`, drift detection through
content hashing surfaced by a SessionStart hook, and the qmd search setup —
keyword-only BM25 over `sources/` and `notes/` with automatic reindexing on every
write, where queries are reduced to content words because asking a question
verbatim retrieves far worse.

See [[Wiki CLI Command Surface]] for the command set, [[Wiki Harness Model]] for
the three-layer model, [[Init Scaffold Contract]] for what writes this file, and
[[Ymir Self-Report Design]] for the reporting design.
