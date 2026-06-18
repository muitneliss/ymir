---
title: Wiki CLI Command Surface
type: concept
date: 2026-06-17
tags: []
source_count: 0
---

# Wiki CLI Command Surface

The wiki CLI (`plugins/ymir/wiki-cli`, TypeScript/Node, built and tested with bun) is the only sanctioned writer of the wiki. It is invoked as `wiki --root ./wiki <command>` and built on commander (parsing/help), a small js-yaml frontmatter module, remark (format), and zod (per-page-type frontmatter schema).

Commands: `init` scaffolds the wiki tree + hook + settings + CLAUDE.md block and validates; `ingest --raw <path> --title <t>` (body on stdin) writes a source summary; `note --type entity|concept|topic --name <n>` (body on stdin) writes a synthesis page; `index` rebuilds `index.md`; `log <op> <title>` appends to `log.md`; `validate` checks frontmatter schema, broken double-bracket links, and orphan notes; `fmt` normalizes markdown; `query <q>` shells out to qmd; `help` prints the contract for the LLM.

Invariant: every write command runs format then validate before committing — on failure it aborts with a nonzero exit and an actionable message, leaving no partial file, and rebuilds index + appends log atomically on success. Frontmatter is injected by the CLI (never hand-written): common title/type/date/tags, plus source/ingested for source pages and source\_count for notes. See [[Wiki Harness Design Spec]] and [[Wiki Harness Implementation Plan]] for origin, [[Wiki Schema]] for the workflow rules, and [[Wiki Harness Model]] for the surrounding model.
