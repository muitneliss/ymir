---
title: Publish and Auto-Fetch Flow
type: concept
date: 2026-06-17
tags: []
source_count: 0
---

# Publish and Auto-Fetch Flow

How the wiki CLI reaches user machines as a ready-to-run binary with no manual install and no Node runtime dependency. Hard requirement: fail fast, no fallback — runtime never touches `dist/cli.js` (it is gitignored and unshipped); any failure is loud stderr + nonzero exit.

Publish side: a CI `compile` job, gated on release-please cutting a release, cross-compiles four `bun --compile` targets into assets `wiki-darwin-arm64`, `wiki-darwin-x64`, `wiki-linux-x64`, `wiki-linux-arm64`, generates `SHA256SUMS.txt`, and `gh release upload`s them to the tag.

Fetch side: the SessionStart hook `ensure-wiki-binary.mjs` runs every session. It reads the expected version from `plugin.json $.version` (release-please keeps this synced — not the independent `wiki-cli/package.json`). If `bin/wiki` exists and `bin/.version` matches, it no-ops. Otherwise it detects the platform via `uname -sm` (pure, unit-tested `detectAssetLabel` in `src/platform.ts`), curls the matching asset + `SHA256SUMS.txt`, verifies sha256, and on success installs `bin/wiki` (chmod 0755) and stamps `.version`; on mismatch or network failure it errors and exits non-zero. See [[Wiki CLI Publish Design Spec]] and [[Wiki CLI Publish Implementation Plan]] for the full design, [[Wiki CLI Command Surface]] for what the binary exposes, and [[Wiki Harness Model]] for the larger picture.
