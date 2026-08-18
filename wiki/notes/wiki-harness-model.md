---
title: Wiki Harness Model
type: concept
date: 2026-08-18
tags: []
source_count: 0
---

# Wiki Harness Model

The wiki harness is Ymir's "wiki / context" concern: a generic, domain-agnostic, LLM-maintained markdown knowledge base scaffolded into a target project. It replaces query-time RAG over raw documents with a persistent, interlinked wiki the LLM grows over time.

Three layers:

* `raw/` — external content not tracked elsewhere in the repo, ingested via `ingest --raw <label>` (no drift tracking).
* `sources/` — one CLI-written summary page per ingested project file, ingested via `ingest --source <path>` (records `source_path` + `source_hash` for drift detection).
* `notes/` — CLI-written entity / concept / topic synthesis pages that link `[[sources]]` and each other.

Plus `SCHEMA.md` (the in-wiki rules reference), `index.md` (CLI-rebuilt catalog), and `log.md` (CLI-appended timeline).

Enforcement has two layers: the wiki CLI is the only writer (formats + validates every change via `fmt`/`validate`/`check`), and a PreToolUse hook (`.claude/hooks/block-wiki-edits.mjs`) blocks any direct Write/Edit/MultiEdit against `wiki/sources`, `wiki/notes`, `index.md`, or `log.md`. Reads are delegated to `qmd` (BM25 keyword search over `sources/` + `notes/`) via `wiki query`, not raw file grepping.

Four moving parts make up the model: [[Init Scaffold Contract]] (how the tree + hook + settings + CLAUDE.md block get laid down), [[Wiki CLI Command Surface]] (the command surface that is the only writer), [[Publish and Auto-Fetch Flow]] (how the CLI binary reaches the user's machine), and drift detection described in [[Wiki Auto-Sync Design]] (source pages track a content hash of the file they summarize; `wiki status` reports staleness; a SessionStart hook surfaces it each session).

Downstream this whole model is installed as a single concern of the harness Ymir generates: the `wiki` section of the [[Harness Playbook Model]] runs `wiki init` in the target repo, and whether a project gets a wiki at all — and which documents it is expected to track — is a decision reached during the [[Socratic Interview Flow]].
