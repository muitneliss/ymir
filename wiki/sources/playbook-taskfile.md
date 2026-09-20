---
title: Playbook Taskfile
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/templates/playbook/taskfile.md
source_path: plugins/ymir/templates/playbook/taskfile.md
source_hash: 3427ee9685e98ffecaf4959de79ad1756330da65e07ef49afeb29ed70b274cdd
ingested: 2026-09-19
---

# Playbook Taskfile

Playbook section template for the `taskfile` concern, assembled into `harness-playbook.md` when `ymir apply` generates the harness. It follows the shape described in [[Harness Playbook Model]]: a Why/Findings placeholder block, a Target, Inputs, Steps and Verify.

Target is `Taskfile.yml` at the project root, or the existing `Taskfile.yaml` when the repo already spells it that way — never a second file beside one that exists. Inputs are `project.language`, `project.runtime`, `concerns.taskfile.tasks[]` (each `{name, desc, runs}`), `concerns.taskfile.wraps`, and the command produced by the lint concern in [[Playbook Lint]].

Step 1 delegates the tool detail to [[Taskfile Guideline]] rather than inlining it, because the Task semantics that differ from Make (parallel `deps`, a separate shell per `cmds` entry, `task --list` hiding tasks without a `desc`) are exactly what a generator improvises wrongly. The rest writes `version: '3'` with top-level `silent: true` and one task per `tasks[]` entry; honours `wraps` (inline the tool for `commands`, call the existing script for `scripts`) and generates one or the other, never both, and never a duplicate `package.json` script; adds the `default` task running `task --list`; keeps the `lint` task's command identical to the one the lint concern generated, because the Taskfile — not the linter section — is where the command text lives; and builds order-sensitive aggregates such as `ci` from task calls in `cmds` rather than `deps`. Verify is `task --list` exiting 0 and listing every `tasks[]` entry with its description.
