---
title: Publish and Auto-Fetch Flow
type: concept
date: 2026-08-18
tags: []
source_count: 0
---

# Publish and Auto-Fetch Flow

How the wiki CLI reaches user machines as a ready-to-run binary with no manual install and no Node runtime dependency. Hard requirement: fail fast, no fallback — runtime never touches `dist/cli.js` (it is gitignored and unshipped); any failure is loud stderr + nonzero exit.

Version source of truth is `plugins/ymir/.claude-plugin/plugin.json`'s `$.version` field, which release-please keeps in sync with the release tag — NOT `wiki-cli/package.json`, whose version is independent and drifts.

Four `bun --compile` cross-compile targets, each uploaded as a GitHub Release asset alongside a `SHA256SUMS.txt`:

* `bun-darwin-arm64` → `wiki-darwin-arm64`
* `bun-darwin-x64` → `wiki-darwin-x64`
* `bun-linux-x64` → `wiki-linux-x64`
* `bun-linux-aarch64` → `wiki-linux-arm64`

A CI `compile` job (triggered by release-please on a cut tag) builds all four targets and runs `gh release upload` to attach them plus the checksums file to the release.

On the user's machine, a SessionStart hook (`hooks/ensure-wiki-binary.mjs`) checks `wiki-cli/bin/wiki` and a `bin/.version` stamp against the expected `plugin.json` version. If they match, it exits 0 (fast path, no network). Otherwise it detects the platform via `uname -sm`, downloads the matching asset + `SHA256SUMS.txt`, verifies the binary's SHA256 against the sums file, and on success installs it to `bin/wiki` (`chmod 0o755`) and writes the version stamp. Any download failure or checksum mismatch is a loud stderr error and a nonzero exit — there is no fallback to `node dist/cli.js`.

See [[Wiki CLI Publish Design Spec]] and [[Wiki CLI Publish Implementation Plan]] for the full design and task breakdown, [[Wiki CLI Command Surface]] for what the fetched binary exposes, and [[Wiki Harness Model]] for how this fetch flow fits the overall wiki harness.
