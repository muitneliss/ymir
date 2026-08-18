---
title: Ymir Socratic Interview Design
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/specs/2026-06-18-ymir-socratic-interview-design.md
source_path: docs/superpowers/specs/2026-06-18-ymir-socratic-interview-design.md
source_hash: 6c4694c2c6c2d9a0d35cdfc72e6618151a4711ebb3bb905fc8c503a5c87530b2
ingested: 2026-08-18
---

# Ymir Socratic Interview Design

Design deepening Ymir's interview from a schema-driven form-fill into a codebase-first Socratic dialogue. Ymir now scans the repo first (Step 0) and forms a per-concern gap report with a verdict of present-strong, present-weak, or missing; each concern then runs a 4-move loop (probe why, grounded in the finding -> recommend with 2-3 trade-offs, recommendation first -> adaptive follow-up only when needed -> confirm+record). Rationale (why/findings/alternatives\_considered) is captured per concern and the profile schema bumps to spec\_version 2. The rules concern now emits native .claude/rules/\*.md path-scoped files instead of docs/rules.md. Adds a bounded cross-concern consistency pass with go-back, a reflection gate, and a spec-review gate before apply.
