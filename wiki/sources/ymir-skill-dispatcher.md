---
title: Ymir SKILL Dispatcher
type: source
date: 2026-06-17
tags: []
source: raw/SKILL.md
ingested: 2026-06-17
---

# Ymir SKILL Dispatcher

`plugins/ymir/SKILL.md` is the single dispatcher skill behind `/ymir`. It builds the harness skeleton for the current project (cwd) only — never application/business code. Harness concerns: (1) rules, (2) lint, (3) CI lint, (4) wiki/context, (5) CLAUDE.md/AGENT.md.

The words after `ymir` are the intent (`$ARGUMENTS`); the skill maps them to a harness concern. `ymir init` runs the full flow (interview + scaffold every fitting piece); narrow actions (`add lint`, `add rules`, `set up CI`) do just that piece; empty arguments mean `init`; ambiguous input gets a short clarifying question.

Step 1 is a socratic interview (AskUserQuestion) — because the user does not hand-write code, the stack cannot be inferred from files: ask Language (Go/TypeScript…), Layer (frontend/backend/both), one decision at a time, only what the action needs. Step 2 scaffolds. The wiki/context concern is the only implemented one: it is scaffolded by a single CLI call `wiki --root ./wiki init` — the CLI owns the tree, the hook, the `.claude/settings.json` entry, the CLAUDE.md block, and validation. It is idempotent; success ends with `wiki valid`. The skill must never copy templates or edit settings/CLAUDE.md directly. After scaffold, tell the user the one-time qmd setup. Boundaries: operate on cwd only, build only the skeleton, prefer asking over assuming.
