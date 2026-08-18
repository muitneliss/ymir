---
title: Wiki Auto-Sync Implementation Plan
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/plans/2026-06-17-wiki-auto-sync.md
source_path: docs/superpowers/plans/2026-06-17-wiki-auto-sync.md
source_hash: eae80b5ba3fc330f9888ec61a6754c33f2c4ff9f532a01c1398fb182d2ca5894
ingested: 2026-08-18
---

# Wiki Auto-Sync Implementation Plan

Task-by-task TDD plan implementing wiki auto-sync: sha256 hash helpers, fileProvenance computing project-relative path + hash, schema changes making source optional in favor of source\_path/source\_hash, computeStatus and hasDrift in src/status.ts, the wiki status command with --json and nonzero exit on drift, a best-effort qmd reindex module wired into ingest/note/index with --no-reindex, the ingest --source CLI flag, and the SessionStart hook wiki-sync-status.mjs registered in hooks.json.
