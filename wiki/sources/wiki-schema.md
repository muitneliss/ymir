---
title: Wiki Schema
type: source
date: 2026-06-17
tags: []
source: raw/SCHEMA.md
ingested: 2026-06-17
---

# Wiki Schema

`wiki/SCHEMA.md` is the self-describing rules document for the LLM-maintained wiki — the only wiki file the LLM may read as instructions and hand-edit (it is rules, not content). Core rule: the LLM never hand-writes or hand-edits wiki documents; all writes go through the Ymir wiki CLI, which formats and validates every change. Direct edits to sources/, notes/, index.md, and log.md are blocked by a PreToolUse hook.

Layers: raw/ — immutable sources (read, never edit; the user adds files here); sources/ — one CLI-written summary page per ingested source; notes/ — CLI-written entity/concept/topic synthesis pages; index.md — CLI-rebuilt catalog; log.md — CLI-appended timeline. The CLI is invoked via the bundled binary `wiki-cli/bin/wiki --root ./wiki <command>`. Key commands: `ingest --raw <raw/path> --title <t>` (body on STDIN) summarizes a source; `note --type entity|concept|topic --name <n>` (body on STDIN) writes a synthesis page; `index` rebuilds the catalog; `validate` health-checks frontmatter, wiki cross-links, and orphans; `query <q>` searches via qmd.

Page conventions: cross-reference pages with double-bracketed exact titles (the CLI validates every link target exists); frontmatter is injected by the CLI — never hand-written. Operations: ingest (user drops a file in raw/ then the LLM reads, discusses, and calls ingest with the extracted body, then updates related notes); query (call query, read returned pages, answer with citations, optionally file the answer back as a note); lint (run validate, then fix reported issues via further CLI commands). Search is lightweight and keyword-only: a one-time `qmd collection add ./wiki --name <project>-wiki` builds the BM25 index — no `qmd embed`, no embeddings, and no local LLM. `wiki query` shells out to `qmd search --json --files`.
