---
title: Harness Playbook Model
type: concept
date: 2026-08-18
tags: []
source_count: 0
---

# Harness Playbook Model

Ymir's harness spec has two files under `.ymir/`: `harness-profile.yaml` is the machine-readable half (audited decisions with a `status` per concern), and `harness-playbook.md` is the LLM-facing half (step-by-step generation instructions). Together they let `ymir apply` drive harness generation without Ymir itself ever writing rules docs, lint configs, CI workflows, the wiki, or `CLAUDE.md` during the interview.

`harness-playbook.md` is assembled deterministically, not free-formed: it starts from the [[Playbook Header]] template (filling `{{PROJECT}}`/`{{DATE}}`), then appends one section per `captured` concern copied from `plugins/ymir/templates/playbook/<concern>.md`. Skipped concerns are omitted.

Every per-concern section shares a fixed shape:

* **Why / Findings** — the rationale and codebase-scan verdict; inert prose, not an executable action.
* **Target** — the artifact `ymir apply`'s preview scan checks for existence (a literal path, a directory like `.claude/rules/`, or a tool/provider-derived path such as the linter config for `concerns.lint.tool`).
* **Inputs** — the `harness-profile.yaml` keys the section consumes.
* **Steps** — what the LLM does to generate the artifact.
* **Verify** — the runnable criterion `ymir apply` checks after generation.

The six template sections are [[Playbook Header]], and per-concern templates for rules ([[Playbook Rules]] — targets `.claude/rules/*.md`, one file per `concerns.rules.files[]` entry with optional `paths:` frontmatter), lint ([[Playbook Lint]]), CI ([[Playbook CI]]), wiki ([[Playbook Wiki]] — the sole exception where the underlying steps also execute directly for the wiki-only intent), and CLAUDE.md ([[Playbook Claude MD]]).

`harness-profile.yaml`'s required fields per concern are documented in [[Harness Profile Schema]] (schema v2: every captured concern requires `why` and `findings`; `rules` requires at least one `files[]` entry).

See [[Ymir Harness Spec Design]] for why the spec is split into two files, and [[Ymir SKILL Dispatcher]] for how Step 3 assembles the playbook and how `ymir apply` later reads `Target`/`Verify` and executes `Steps`.
