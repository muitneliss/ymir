---
title: Wiki Auto-Sync Design
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/specs/2026-06-17-wiki-auto-sync-design.md
source_path: docs/superpowers/specs/2026-06-17-wiki-auto-sync-design.md
source_hash: 2e98a00ac8ca5692da587cdd81fc6f3af7e35959ab7b1ce24706c35cd09d54d2
ingested: 2026-08-18
---

# Wiki Auto-Sync Design

Design for wiki auto-sync: source pages record source\_path + source\_hash (sha256) in frontmatter at ingest time; computeStatus classifies each source page as current, stale, missing, or untracked by re-hashing the tracked file. A SessionStart hook (wiki-sync-status.mjs) runs wiki status --json each session and surfaces drift as a re-ingest instruction. Every wiki write best-effort runs qmd collection add (reindex) so search stays current. Content regeneration stays agent-driven; only detection, surfacing, and reindexing are automatic.
