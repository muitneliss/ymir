---
title: Harness Playbook Model
type: concept
date: 2026-09-19
tags: []
source_count: 0
---

# Harness Playbook Model

Ymir's harness spec has two files under `.ymir/`: `harness-profile.yaml` is the machine-readable half (audited decisions with a `status` per concern), and `harness-playbook.md` is the LLM-facing half (step-by-step generation instructions). Together they let `ymir apply` drive harness generation without Ymir itself ever writing rules docs, lint configs, Taskfiles, CI workflows, the wiki, or `CLAUDE.md` during the interview.

`harness-playbook.md` is assembled deterministically, not free-formed: it starts from the [[Playbook Header]] template (filling `{{PROJECT}}`/`{{DATE}}`), then appends one section per `captured` concern copied from `plugins/ymir/templates/playbook/<concern>.md`. Skipped concerns are omitted.

Every per-concern section shares a fixed shape:

* **Why / Findings** — the rationale and codebase-scan verdict; inert prose, not an executable action.
* **Target** — the artifact `ymir apply`'s preview scan checks for existence (a literal path, a directory like `.claude/rules/`, or a tool/provider-derived path such as the linter config for `concerns.lint.tool`).
* **Inputs** — the `harness-profile.yaml` keys the section consumes.
* **Steps** — what the LLM does to generate the artifact.
* **Verify** — the runnable criterion `ymir apply` checks after generation.

The seven template sections are [[Playbook Header]], and per-concern templates for rules ([[Playbook Rules]] — targets `.claude/rules/*.md`, one file per `concerns.rules.files[]` entry with optional `paths:` frontmatter), lint ([[Playbook Lint]]), taskfile ([[Playbook Taskfile]] — targets `Taskfile.yml`), CI ([[Playbook CI]]), wiki ([[Playbook Wiki]] — the sole exception where the underlying steps also execute directly for the wiki-only intent), and CLAUDE.md ([[Playbook Claude MD]]).

Section order encodes ownership of a command: the taskfile section comes before the CI section because the Taskfile owns the command text, so the lint section stops emitting a package script when taskfile is captured and the CI section calls `task <name>` instead of repeating the command. One command, one owner, three callers.

A section's Steps may delegate tool-specific detail to a skill reference rather than inlining it: the lint section branches to [[Biome Ruleset Guideline]] when `concerns.lint.tool` is `biome`, which owns how `concerns.lint.ruleset` maps to config per Biome version, the nursery and domain policy, and the severity gate; the taskfile section branches to [[Taskfile Guideline]], which owns the Taskfile shape, the `wraps` semantics, the install matrix, and the Task behaviours (parallel `deps`, a separate shell per command) a generator would otherwise improvise.

`harness-profile.yaml`'s required fields per concern are documented in [[Harness Profile Schema]] (schema v2: every captured concern requires `why` and `findings`; `rules` requires at least one `files[]` entry; `lint` requires `ruleset` when the tool is `biome`; `taskfile` requires `wraps` and at least one `tasks[]` entry with a `name` and `runs`).

See [[Ymir Harness Spec Design]] for why the spec is split into two files, and [[Ymir SKILL Dispatcher]] for how Step 3 assembles the playbook and how `ymir apply` later reads `Target`/`Verify` and executes `Steps`.
