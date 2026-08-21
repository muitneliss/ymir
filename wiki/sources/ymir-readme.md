---
title: Ymir README
type: source
date: 2026-08-21
tags: []
source: README.md
source_path: README.md
source_hash: e17664f73bcd594c924192ebb0e77c317a6fa98c66a8bd7eaf7ebfcc487e1dd7
ingested: 2026-08-21
---

# Ymir README

Ymir is an agent skill that produces a harness spec for a repo — rules, lint, CI
lint, wiki/context, and `CLAUDE.md`/`AGENT.md`. It never generates application
code. It explores the codebase, runs a deep per-concern Socratic interview,
re-audits for consistency, and emits `.ymir/harness-profile.yaml` plus
`.ymir/harness-playbook.md`; `ymir apply` then generates the harness with backups,
and `ymir revert` undoes the last apply.

Distribution is through the skills CLI only: `npx skills@latest add
muitneliss/ymir`, with `--global` to install for every project. It works with
Claude Code, Cursor, Codex and any other agent the skills CLI supports, landing
in `~/.claude/skills/ymir/` or the agent-specific equivalent. Distribution is
purely git — `skills add` clones straight from the repo, so there is no publish
step or registry account — and `skills update` / `skills remove` manage the
lifecycle. The earlier Claude Code plugin and marketplace path is retired; the
README keeps a short migration recipe (`claude plugin uninstall`, `marketplace
remove`, then `skills add`), noting that projects are unaffected because `.ymir/`
specs and generated harnesses live in each repo rather than in the install.

The `wiki` CLI is a compiled binary fetched from GitHub Releases on first use,
matched to the installed version and verified against a published SHA256. Claude
Code fetches it automatically at session start; other agents run
`ensure-wiki-binary.mjs` once, then scaffold with `wiki init --no-hook`.

The README also documents the self-report contract. A crash writes a redacted
report to `~/.ymir/` and says so; nothing is transmitted until the user runs
`wiki report --yes`, and `wiki report` alone prints the literal issue body for
review. Reports carry the subcommand, error, version and OS/arch only — paths,
hostnames, emails, git remotes and credential-shaped strings are stripped before
storage, and no file contents or argument values are included. Delivery uses the
user's own `gh` login so no credential ships; without `gh` a prefilled issue URL
is printed. Opting out via `--off`, `DO_NOT_TRACK=1`, `DISABLE_TELEMETRY=1` or
`YMIR_REPORT=off` stops capture entirely, and forks redirect with
`YMIR_REPORT_REPO`.

The Status section points at the generated release badge rather than a
hand-written version number, which had drifted two releases behind.

See [[Ymir SKILL Dispatcher]] for the skill flow, [[Ymir Self-Report Design]] for
the reporting architecture, and [[Wiki Schema]] for the wiki CLI rules.
