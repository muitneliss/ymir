---
title: Ymir SKILL Dispatcher
type: source
date: 2026-08-21
tags: []
source: plugins/ymir/SKILL.md
source_path: plugins/ymir/SKILL.md
source_hash: 3bd4ebf7b43a6ba605c0eb749fd9499305246f01ecadb6b2d9c482804de4478b
ingested: 2026-08-21
---

# Ymir SKILL Dispatcher

The single dispatcher skill that interprets whatever the user types after `ymir`
as intent and acts on the current project. It produces a harness spec, never
application code.

The interview step writes only `.ymir/harness-profile.yaml` and
`.ymir/harness-playbook.md`. Step 0 scans the repo and prints a per-concern gap
report; Step 1 runs the four-move Socratic engine per concern, one question per
message; Step 2 gates on required fields, cross-concern consistency and a
reflection summary; Step 3 assembles the playbook from bundled templates; Step 4
is a spec-review gate; Step 5 offers to apply.

`ymir apply` is the separate explicit step that generates the harness: load and
preview a plan table, confirm once, capture a run-id, then per concern create or
ask keep/merge/overwrite while backing up first, verify every concern, and print
a summary. `ymir revert` restores that run's backups, with the documented
limitation that files created from scratch have no backup. The wiki-only intents
`ymir add context` and `ymir add wiki` are the one exception that writes project
files directly, via a single CLI call.

Asset paths are resolved relative to `$SKILL_ROOT`, the directory containing
`SKILL.md`, derived from the file's own path — commonly `~/.claude/skills/ymir/`
or a project-local `.claude/skills/ymir/` now that distribution is the skills CLI
rather than a Claude Code plugin.

The skill also carries the self-report protocol. The wiki CLI captures its own
crashes unaided; what it cannot see is this skill's flow breaking — a playbook
section missing its Target line, an apply that writes nothing, an instruction
that contradicts itself. Claude records those with `wiki report --skill`, after
telling the user, describing rather than pasting so the user's code and profile
values never enter the report, reporting Ymir's faults rather than the user's
choices, once per session, and noting that nothing leaves the machine until the
user opts in. Feature requests and complaints go through `wiki report --feedback`.

See [[Ymir README]] for install and the user-facing contract,
[[Socratic Interview Flow]] for the interview engine,
[[Harness Playbook Model]] for the spec shape, and [[Ymir Self-Report Design]] for
the reporting architecture.
