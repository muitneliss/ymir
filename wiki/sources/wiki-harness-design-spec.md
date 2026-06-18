---
title: Wiki Harness Design Spec
type: source
date: 2026-06-17
tags: []
source: raw/wiki-harness-design.md
ingested: 2026-06-17
---

# Wiki Harness Design Spec

Design (approved) for Ymir's wiki/context harness. Implements the "LLM Wiki" pattern: instead of query-time RAG over raw documents, an LLM incrementally builds and maintains a persistent, interlinked markdown knowledge base. Three layers: raw sources (immutable, read-only to the LLM), the wiki (LLM-generated summaries/notes/index/log — the LLM owns this), and the schema (a document telling the LLM how the wiki is structured and which workflows to follow).

Goals: Ymir scaffolds a generic, domain-agnostic wiki skeleton into cwd; the LLM never hand-writes wiki docs — all writes go through a CLI that owns structure (filename, frontmatter, placement, cross-link validation, formatting) and updates index+log atomically; the CLI formats then validates every write, rejecting invalid input so the LLM must fix it; a PreToolUse hook hard-blocks bypassing the CLI via direct edits; search uses qmd (hybrid BM25 + vector + LLM-rerank). Non-goals: no domain presets, no business code, Ymir itself does not implement ingest/query/lint logic (that lives in SCHEMA.md + the CLI).

Architecture is two-sided: write+validate = the bundled TS/Node Wiki CLI; read+search = qmd. Four components: (1) the Wiki CLI (commander, js-yaml frontmatter, remark format, zod schema; commands ingest/note/index/log/validate/fmt/query/help; every write runs fmt then validate before committing); (2) the scaffolded wiki tree (raw/ sources/ notes/ index.md log.md SCHEMA.md); (3) the PreToolUse hook scaffolded into the target project (`block-wiki-edits.mjs` + merged settings.json) denying Write/Edit/MultiEdit on sources/, notes/, index.md, log.md while allowing raw/\*\* and SCHEMA.md; (4) qmd read-side config. Frontmatter contract (zod): common title/type/date/tags; source pages add source+ingested; note pages add source\_count.
