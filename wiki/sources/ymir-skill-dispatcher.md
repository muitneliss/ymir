---
title: Ymir SKILL Dispatcher
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/SKILL.md
source_path: plugins/ymir/SKILL.md
source_hash: 5984f35113392cd3f24fb8842e6525d0b5fcf4f0828ecbf8d72a893551cdb7f0
ingested: 2026-09-19
---

# Ymir SKILL Dispatcher

The single dispatcher skill that interprets whatever the user types after `ymir` as intent and acts on the current project. It produces a harness spec, never application code.

The interview step writes only `.ymir/harness-profile.yaml` and `.ymir/harness-playbook.md`. Step 0 scans the repo and prints a per-concern gap report; Step 1 runs the four-move Socratic engine per concern, one question per message; Step 2 gates on required fields, cross-concern consistency and a reflection summary; Step 3 assembles the playbook from bundled templates; Step 4 is a spec-review gate; Step 5 offers to apply.

The checklist is one foundation item (project/techstack) plus six concerns: rules, lint, taskfile, CI lint, wiki/context and the steering file. `taskfile` sits before `ci` on purpose — the Taskfile owns the command text and CI then calls `task <name>` rather than keeping a second copy of it — and Step 0's scan asks, when no `Taskfile.{yml,yaml}` exists, what plays that role today: `package.json` scripts, a `Makefile`, or commands living only in the README and the CI workflow. The narrow intent `ymir add taskfile` interviews that concern alone. See [[Playbook Taskfile]] and [[Taskfile Guideline]].

`ymir apply` is the separate explicit step that generates the harness: load and preview a plan table, confirm once, capture a run-id, then per concern create or ask keep/merge/overwrite while backing up first, verify every concern, and print a summary. `ymir revert` restores that run's backups, with the documented limitation that files created from scratch have no backup. The wiki-only intents `ymir add context` and `ymir add wiki` are the one exception that writes project files directly, via a single CLI call.

Asset paths are resolved relative to `$SKILL_ROOT`, the directory containing `SKILL.md`, derived from the file's own path — commonly `~/.claude/skills/ymir/` or a project-local `.claude/skills/ymir/` now that distribution is the skills CLI rather than a Claude Code plugin.

The skill also carries the self-report protocol. The wiki CLI captures its own crashes unaided; what it cannot see is this skill's flow breaking — a playbook section missing its Target line, an apply that writes nothing, an instruction that contradicts itself. Claude records those with `wiki report --skill`, after telling the user, describing rather than pasting so the user's code and profile values never enter the report, reporting Ymir's faults rather than the user's choices, once per session, and noting that nothing leaves the machine until the user opts in. Feature requests and complaints go through `wiki report --feedback`.

See [[Ymir README]] for install and the user-facing contract, [[Socratic Interview Flow]] for the interview engine, [[Harness Playbook Model]] for the spec shape, and [[Ymir Self-Report Design]] for the reporting architecture.
