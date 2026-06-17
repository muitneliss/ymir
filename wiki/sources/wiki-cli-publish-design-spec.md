---
title: Wiki CLI Publish Design Spec
type: source
date: 2026-06-17
tags: []
source: raw/wiki-cli-publish-design.md
ingested: 2026-06-17
---

# Wiki CLI Publish Design Spec

Design (approved) for publishing the wiki CLI as standalone GitHub Release binaries and auto-fetching them on plugin use, so installers get a ready-to-run binary with no manual step and no Node runtime dependency.

Goals: compile standalone single-file binaries on each release and publish them as GitHub Release assets; on plugin use, automatically fetch the matching-platform binary into a cached location; the LLM drives the wiki exclusively through this binary. Hard requirement: fail fast, no fallback — there is no `node dist/cli.js` path. If the SessionStart hook cannot download/verify the binary it writes a loud stderr error and exits non-zero; if the SKILL needs the binary and it is absent it stops with an explicit error; `dist/cli.js` is gitignored and never shipped at runtime. Non-goals: no Windows, no npm publishing, no self-update beyond a version-stamp check, no signing beyond sha256.

Four bun --compile targets map to assets wiki-darwin-arm64 / -x64 / wiki-linux-x64 / -arm64 (selected by `uname -sm`), plus SHA256SUMS.txt. Components: (1) a CI `compile` job gated on release-please `release_created`, building all four targets and `gh release upload`ing them; (2) `src/platform.ts` pure `detectAssetLabel` (unit-tested, no network); (3) the SessionStart hook `ensure-wiki-binary.mjs` that reads the expected version from `plugin.json $.version` (release-please keeps it synced — not wiki-cli/package.json which drifts), no-ops if `bin/wiki` + `bin/.version` match, else detects platform, curls the asset + SHA256SUMS, sha256-verifies, installs to `bin/wiki` chmod 0755 and stamps `.version`; (4) SKILL/SCHEMA wiring to call `bin/wiki` not `dist/cli.js`. Flagged pre-existing issue: `.release-please-manifest.json`/`version.txt` at 0.1.0 while plugin.json/package.json at 0.2.0.
