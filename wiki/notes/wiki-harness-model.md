---
title: Wiki Harness Model
type: concept
date: 2026-06-17
tags: []
source_count: 0
---

# Wiki Harness Model

The wiki harness is Ymir's "wiki / context" concern: a generic, domain-agnostic, LLM-maintained markdown knowledge base scaffolded into a target project. It replaces query-time RAG over raw documents with a persistent, interlinked wiki the LLM grows over time.

Three layers. **Raw** (`wiki/raw/`) holds immutable source documents the LLM reads but never edits; the user drops files here. **Wiki** (`sources/`, `notes/`, `index.md`, `log.md`) is LLM-owned but written exclusively through the CLI: `sources/` are one-per-document summaries, `notes/` are entity/concept/topic synthesis, `index.md` is the rebuilt catalog, `log.md` the appended timeline. **Schema** (`wiki/SCHEMA.md`) is the rules document telling the LLM how the wiki is structured and which workflows (ingest / query / lint) to follow.

Two enforcement layers keep it deterministic: the CLI formats then validates every write (rejecting invalid input so the LLM must fix it), and a PreToolUse hook hard-blocks any direct Write/Edit/MultiEdit on wiki content paths. Read/search is delegated to qmd. See [[Wiki Harness Design Spec]] for the full design, [[Wiki Schema]] for the rules contract, and [[Ymir README]] / [[Ymir SKILL Dispatcher]] for how Ymir scaffolds it.

The model is realized by four moving parts: the [[Init Scaffold Contract]] lays the tree, hook, settings, and CLAUDE.md block; the [[Wiki CLI Command Surface]] is the only sanctioned writer; and the [[Publish and Auto-Fetch Flow]] delivers that CLI as a verified per-platform binary.
