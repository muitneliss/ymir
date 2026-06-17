---
title: Wiki CLI Publish Implementation Plan
type: source
date: 2026-06-17
tags: []
source: raw/wiki-cli-publish-plan.md
ingested: 2026-06-17
---

# Wiki CLI Publish Implementation Plan

Task-by-task implementation plan for compiling, publishing, and auto-fetching the wiki CLI binaries (TDD, checkbox steps, executed via superpowers subagent-driven-development).

Goal: compile standalone wiki CLI binaries on every release, publish them as GitHub Release assets, and auto-download the matching-platform binary into the plugin on first session use — no fallback, fail loud. Architecture: a CI `compile` job (triggered by release-please) cross-compiles four platform binaries with `bun --compile` and attaches them + SHA256SUMS.txt to the GitHub Release; a plugin-level SessionStart hook (`hooks/ensure-wiki-binary.mjs`) checks for the binary every session start, downloads and sha256-verifies it on first use or version change, and exits non-zero on any failure; the SKILL calls the binary directly and `dist/` is gitignored.

File map: create `src/platform.ts` (`detectAssetLabel(unameSM)` pure fn) + `test/platform.test.ts`; create `hooks/ensure-wiki-binary.mjs` + `hooks/hooks.json` (wires the hook to SessionStart); modify `.github/workflows/release-please.yml` (add outputs + compile job), `wiki-cli/package.json` (compile:\* scripts), `wiki-cli/.gitignore` (add dist/), and `SKILL.md` + `templates/wiki/SCHEMA.md` (swap `node .../dist/cli.js` for `.../bin/wiki`). Tech: Bun 1.3.14, GitHub Actions (release-please-action\@v4, setup-bun\@v2), curl + sha256sum. Merge order note: land the CI `test`-job PR first so compile chains test → release-please → compile.
