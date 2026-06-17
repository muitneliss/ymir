---
title: Wiki Harness Implementation Plan
type: source
date: 2026-06-17
tags: []
source: raw/wiki-harness-plan.md
ingested: 2026-06-17
---

# Wiki Harness Implementation Plan

Task-by-task implementation plan for the Ymir wiki harness, meant to be executed via superpowers subagent-driven-development / executing-plans (checkbox steps, TDD).

Goal: make Ymir scaffold an LLM-maintained wiki skeleton into a target project, backed by a TypeScript CLI that owns all wiki writes (format + validate) and a PreToolUse hook that blocks hand-editing. Architecture: the bundled TS/Node CLI (`plugins/ymir/wiki-cli`) is the only sanctioned write path — it injects frontmatter, places files, formats, validates, and rebuilds index/log atomically; a PreToolUse hook scaffolded into the target project denies Write/Edit/MultiEdit on wiki content paths; qmd handles read/search; the SKILL wiki branch copies templates and installs the hook.

CLI module layout: cli.ts (commander entry), paths.ts (root resolution, slug, page paths), schema.ts (zod frontmatter + types), format.ts (remark formatter), pages.ts (render source/note pages), store.ts (fs read/write/list), index-build.ts (rebuild index.md), wikilog.ts (append log.md), validate.ts (frontmatter + link + orphan checks), and commands/ for ingest/note/index/log/validate/fmt/query/help. Templates live under plugins/ymir/templates/ (wiki SCHEMA.md + index/log seeds + gitkeep; hook script + settings snippet). Each unit has a matching bun test. The plan was the source for the actually-shipped CLI.
