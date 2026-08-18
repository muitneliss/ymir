---
title: Playbook Lint
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/lint.md
source_path: plugins/ymir/templates/playbook/lint.md
source_hash: bb0e3fd28726ced6bbdc1f076ffc459cd431e391466dbd09e8634a382872a5fb
ingested: 2026-08-18
---

# Playbook Lint

Playbook section template for the lint concern. Opens with a Why/Findings placeholder block, targets the linter config file for concerns.lint.tool (falling back to each tool's conventional filename: eslint, biome, golangci-lint, ruff), takes project.language/runtime and concerns.lint.tool/strict/style as Inputs, and its Steps generate the config file plus a lint (and lint:fix) script/target appropriate to the runtime. Verify requires the lint command to run clean on a fresh checkout.
