---
title: Wiki Init Command Plan
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/plans/2026-06-17-wiki-init-command.md
source_path: docs/superpowers/plans/2026-06-17-wiki-init-command.md
source_hash: 134c5a42188be8b93f2ed21b9501d58eb86f46952cb354e96122a83e6f75fe66
ingested: 2026-08-18
---

# Wiki Init Command Plan

TDD implementation plan for wiki init: vendors templates into src/templates/ with ambient *.md/*.mjs text-module declarations, adds an embedded.ts module re-exporting the baked-in assets plus a typed SETTINGS\_HOOK\_ENTRY, a scaffold.ts with pure fs-free helpers (mergeSettings, claudeBlockPresent, appendClaudeBlock), and a runInit orchestration function wired to the init CLI subcommand. Concludes by deleting the now-obsolete plugins/ymir/templates/ directory once SKILL.md calls the binary instead.
