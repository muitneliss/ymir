---
title: Ymir CLAUDE.md
type: source
date: 2026-09-23
tags: []
source: CLAUDE.md
source_path: CLAUDE.md
source_hash: 2da013c38956bd701e81b5e87500282d31c07ea741f8fbad8841a7c0b2ff8794
ingested: 2026-09-23
---

# Ymir CLAUDE.md

Claude Code adapter: imports AGENTS.md (@AGENTS.md), which holds the shared agent rules, and adds only Claude-specific notes.
Keeps the '## Wiki / Context' heading because wiki init checks for it and would otherwise append a duplicate wiki block. Notes that in Claude Code the PreToolUse hook .claude/hooks/block-wiki-edits.mjs enforces the wiki rules and SessionStart hooks in .claude/settings.json fetch the wiki binary and report drift. See [[Ymir AGENTS.md]] and [[Wiki Schema]].
