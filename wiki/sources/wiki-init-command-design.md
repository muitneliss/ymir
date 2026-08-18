---
title: Wiki Init Command Design
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/specs/2026-06-17-wiki-init-command-design.md
source_path: docs/superpowers/specs/2026-06-17-wiki-init-command-design.md
source_hash: 354cd486d8faa1b7ad17fbecca045ea13c834dd9564e6f6c9180eba92ac55099
ingested: 2026-08-18
---

# Wiki Init Command Design

Design for the wiki init command: moves the wiki/context scaffold (tree, PreToolUse hook, .claude/settings.json merge, CLAUDE.md block, validation) out of manual SKILL.md steps into a single idempotent wiki init CLI call. Since the CLI ships as a compiled standalone bun binary downloaded from GitHub releases, template content (SCHEMA.md, index/log seeds, the hook script) is baked into the binary via import ... with { type: "text" } rather than read from disk. Settings merging and the CLAUDE.md block use typed TS constants so they can be deep-merged/marker-matched programmatically.
