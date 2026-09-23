---
title: Ymir AGENTS.md
type: source
date: 2026-09-23
tags: []
source: AGENTS.md
source_path: AGENTS.md
source_hash: 5599a2b479cdbb39ce26ac4a92a4fee82d9fd2509dd28af970891d83fc593641
ingested: 2026-09-23
---

# Ymir AGENTS.md

Shared instructions for every coding agent in the repo; Codex reads it natively and Claude Code imports it from CLAUDE.md, so it is the single source of truth for agent rules.
Wiki / Context rule: agents must not hand-edit wiki/sources, wiki/notes, wiki/index.md or wiki/log.md; all wiki writes go through ./wiki/bin/wiki --root ./wiki <command>. Direct edits are allowed only in wiki/raw/\*\* and wiki/SCHEMA.md.
Enforcement: a PreToolUse hook blocks direct file edits in both Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
Root \*.md files are wiki-tracked sources, so changing one requires re-ingesting it or CI's wiki check --error-on-untracked-sources fails. See [[Wiki Schema]] and [[Ymir CLAUDE.md]].
