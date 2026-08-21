---
title: Ymir README
type: source
date: 2026-08-21
tags: []
source: README.md
source_path: README.md
source_hash: 1e42ea494c67cb9c1e84ba990a19b2d872591fd676802118a135457821cda03d
ingested: 2026-08-21
---

# Ymir README

Ymir is a Claude Code plugin and agent skill that produces a harness spec for a
repo — rules, lint, CI lint, wiki/context, and `CLAUDE.md`/`AGENT.md`. It never
generates application code. It explores the codebase, runs a deep per-concern
Socratic interview, re-audits for consistency, and emits
`.ymir/harness-profile.yaml` plus `.ymir/harness-playbook.md`; `ymir apply` then
generates the harness with backups, and `ymir revert` undoes the last apply.

Install either as a Claude Code plugin, which wires the hooks automatically, or
as an agent skill via the skills CLI, which reaches Cursor and Codex too but
needs the wiki binary bootstrapped once by hand.

The README documents the self-report contract. Because Ymir runs on the user's
own machine, its failures are invisible upstream unless sent. A crash writes a
redacted report to `~/.ymir/` and says so; nothing is transmitted until the user
runs `wiki report --yes`, and `wiki report` alone prints the literal issue body
for review. Reports carry the subcommand, error type and message, Ymir's version
and the OS and architecture — paths, hostnames, email addresses, git remotes and
credential-shaped strings are stripped before anything is stored, project paths
keep only their relative tail, and no file contents or argument values are ever
included. Delivery uses the user's own `gh` login, so the issue is filed by them
and Ymir ships no credential; without `gh` a prefilled issue URL is printed
instead. Opting out via `wiki report --off`, `DO_NOT_TRACK=1`,
`DISABLE_TELEMETRY=1` or `YMIR_REPORT=off` stops capture entirely rather than
merely withholding, and forks can redirect reports with `YMIR_REPORT_REPO`.

See [[Ymir SKILL Dispatcher]] for the skill flow, [[Ymir Self-Report Design]] for
the reporting architecture, and [[Wiki Schema]] for the wiki CLI rules.
