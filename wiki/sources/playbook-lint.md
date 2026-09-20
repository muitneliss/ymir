---
title: Playbook Lint
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/templates/playbook/lint.md
source_path: plugins/ymir/templates/playbook/lint.md
source_hash: 51d9b9e797a2661f426a87352050711589f3580b5bc5f77ad6232cace0270b05
ingested: 2026-09-19
---

# Playbook Lint

Playbook section template for the lint concern. Opens with a Why/Findings placeholder block, targets the linter config file for `concerns.lint.tool` (falling back to each tool's conventional filename: eslint, biome, golangci-lint, ruff), and takes `project.language`/`runtime`/`layer` plus `concerns.lint.tool`/`ruleset`/`strict`/`style` as Inputs.

Its Steps generate the config from `ruleset`, `strict` and `style`; branch to [[Biome Ruleset Guideline]] when the tool is `biome` (quoting the `{ "linter": { "rules": { "preset": "all" } } }` form for `ruleset: full` on Biome >= 2.5, with a version check and a per-group fallback below that); settle the command, noting that for biome the severity gate lives in the command (`biome ci --error-on-warnings .` when `strict: true`, because rules outside the recommended set default to warn and `biome ci` exits 0 on warnings); and land the config on existing code by running the fixer then disabling single rules with a written reason rather than weakening the ruleset. Verify requires the `lint` command to run clean on a fresh checkout.

Where the command lives depends on the `taskfile` concern: when it is captured, the lint command belongs in the `lint` task described by [[Playbook Taskfile]] and nowhere else — no duplicate `package.json` script — and only otherwise does this section add a `lint`/`lint:fix` script for the runtime. That keeps one owner for the command text.
