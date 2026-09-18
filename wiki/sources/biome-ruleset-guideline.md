---
title: Biome Ruleset Guideline
type: source
date: 2026-09-18
tags: []
source: plugins/ymir/references/biome-ruleset.md
source_path: plugins/ymir/references/biome-ruleset.md
source_hash: 3ef127ce6b7206d1e54507b08bbdaa4c1a64b48969e6d10cd0eb88816e4b7b41
ingested: 2026-09-18
---

# Biome Ruleset Guideline

Skill reference that defines `concerns.lint.ruleset` for Biome and is the source of truth both for the ruleset question in [[Socratic Interview Reference]] and for config generation in [[Playbook Lint]].

Two values: `full` (every stable rule in every group — the default recommendation for biome) and `recommended` (Biome's recommended subset, for a large codebase adopting a linter gradually). Nursery rules stay off in both, because they change between releases and would let a patch upgrade break the build.

How `full` is expressed depends on the installed version. `linter.rules.preset` exists only from Biome 2.5.0 and excludes nursery by design; on 2.0–2.4 there is no `preset` (Biome reports "Found an unknown key `preset`" and fails), so each group is turned on individually instead — `a11y`, `complexity`, `correctness`, `performance`, `security`, `style`, `suspicious`, dropping `a11y` for a backend-only layer. `ruleset: recommended` writes no `rules` key at all.

The reference carries a baseline `biome.json` (pinned `$schema`, `vcs.useIgnoreFile` instead of a second ignore list, `formatter.indentStyle` and `javascript.formatter.quoteStyle` fed from `concerns.lint.style`, and organize-imports as the only assist action — `assist.actions.preset: "all"` is rejected because key/property sorting rewrites source order for no defect-catching gain). Biome also formats its own config, so `lint:fix` runs right after generation.

Two behaviours make or break a full ruleset. **Domains:** `preset: "all"` overrides Biome's dependency-based domain detection and turns on every framework domain, so a plain JS file draws Qwik diagnostics unless unused domains are explicitly set to `"none"`; used domains go to `"recommended"`, never `"all"` (domain `"all"` includes that domain's nursery rules), and `project`/`types` build a cross-file module graph that slows linting. **Severity:** most rules outside the recommended set default to warn and `biome ci` exits 0 on warnings, so `full` gates nothing without `--error-on-warnings`. That keeps the two profile fields separate — `ruleset` decides which rules run, `strict` decides what fails the build — and makes `full` + `strict: false` an advisory-only setup that must be a recorded decision rather than a default.

Landing `full` on existing code is expected to be noisy: run the safe fixer, review unsafe fixes by diff, then fix or disable single rules with a reason in a `biome.jsonc` comment — never downgrade the preset to silence one rule. Verification is that the `lint` script exits 0, which also proves the installed Biome understands the config, since an unsupported key is a hard error rather than a silent skip.
