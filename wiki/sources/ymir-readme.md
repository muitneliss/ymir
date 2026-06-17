---
title: Ymir README
type: source
date: 2026-06-17
tags: []
source: raw/README.md
ingested: 2026-06-17
---

# Ymir README

Ymir is a Claude Code plugin marketplace + plugin that scaffolds the mandatory project harness every repo should start with: rules, lint, CI lint, wiki/context, and CLAUDE.md/AGENT.md. It does not generate application code — it interviews the user about their techstack (Go vs TypeScript, frontend vs backend) and builds only the skeleton; the user then drives real development through Claude Code, steered by that harness.

Ymir is one dispatcher skill, not a fixed command list: whatever follows `ymir` is the intent (`ymir init`, `ymir add lint`, `ymir add rules`, `ymir set up CI`). Layout: a `.claude-plugin/marketplace.json` marketplace plus `plugins/ymir/` (plugin.json + SKILL.md). Try locally via `/plugin marketplace add ./`, `/plugin install ymir@ymir`, `/reload-plugins`, then `/ymir init for this project`.

Status at v0.2.0: the wiki/context harness piece is implemented — `/ymir add context` scaffolds an LLM-maintained `wiki/` backed by the bundled wiki CLI, installs a PreToolUse hook blocking hand-edits of wiki docs, and wires `qmd` for search. The socratic interview and other pieces (lint, CI, rules) are still stubbed.
