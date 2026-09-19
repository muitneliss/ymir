---
title: Socratic Interview Reference
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/references/socratic-interview.md
source_path: plugins/ymir/references/socratic-interview.md
source_hash: 141b266a107b49c53ada2295c2a19ca91e7b62370109e4fbf3c46214902df51c
ingested: 2026-09-19
---

# Socratic Interview Reference

# Ymir Socratic Interview Engine

This drives **Step 1** of `SKILL.md`. It turns the harness interview from a
form-fill into a grounded dialogue. Read it before interviewing.

## Cardinal rule — one question per message

Every question is its own `AskUserQuestion` call. Ask one thing, then **stop and
yield the floor**. Never batch questions "to be efficient" — batching freezes the
conversation and you lose the ability to let an answer shape the next question.

## Inputs from Step 0

Before Step 1 you hold a **gap report**: for each concern a verdict of
`present-strong`, `present-weak`, or `missing`, plus what was detected. Every
question below is grounded in that finding — never ask something the scan already
answered.

## The per-concern loop (4 moves)

Run this for each in-scope concern, in checklist order:

1. **Probe the *why* (open, grounded).** Ask the purpose/pain behind the concern,
   citing the finding. Not "which linter?" but "I see no linter and mixed quote
   styles in `src/` — are you mainly after catching bugs, enforcing style, or
   both?"
2. **Recommend with trade-offs, recommendation first.** Offer 2-3 grounded
   options, lead with your pick and why, invite challenge: "For TS/bun I'd pick
   biome — one fast tool, near-zero config; trade-off vs eslint is fewer plugins.
   Sound?"
3. **Adaptive follow-up — only when needed.** Ask a follow-up *only* if the answer
   reveals a gap, surprise, or contradiction. Otherwise go straight to confirm.
   This is the friction ceiling that keeps it a dialogue, not an interrogation.
4. **Confirm + record.** Write `decision`, `why`, `findings`,
   `alternatives_considered` into `.ymir/harness-profile.yaml`, then advance.

### Grounding by verdict

* `present-strong` → confirm or tune what exists ("keep eslint as-is?").
* `present-weak` → name the weakness and propose strengthening.
* `missing` → propose adding — but apply **YAGNI**: if the user has no real need,
  record `status: skipped` with a reason instead of forcing it.

## Per-concern probe bank

### project / techstack (item 0)

Mostly **confirm** what Step 0 detected: "Detected TypeScript on bun, backend,
GitHub — right?" Only ask cold if detection was empty.

### target\_agent (item 0b — ask immediately after techstack)

Which AI agent(s) will read and act on this harness? The answer shapes every
subsequent output: steering file name, rules location, and wiki enforcement.

Probe: "Is this repo worked on exclusively with Claude Code, or might other
agents (Cursor, Codex, Copilot, OpenCode) use the harness too?"

* If Claude Code only → record `target_agent: { value: claude-code, why: ..., findings: "claude-code — .claude/ present" }` (or `findings: "unknown — inferred from context"`).
* If multiple / agent-neutral → record `target_agent: { value: any, why: ..., findings: "any — no agent-specific tooling detected" }`.

This is a **prerequisite**: record it before interviewing any concern. It does
not go through the 4-move loop — a single confirm-and-record exchange suffices.

### rules → rules files (special: scope probing + target\_agent branch)

For `claude-code` targets, rules become native `.claude/rules/*.md` path-scoped
rule files. For `any` targets, rules will be embedded inline in `AGENT.md`
(the `claude_md` concern handles this — no separate rule files). After the *why*:

* Elicit the conventions to **obey** and patterns to **avoid**.
* For each rule (group), ask its **scope**: project-wide (always-on, no `paths`)
  or scoped to files — "Does 'explicit return types' apply to all TS, or just
  `src/api/**`?" Path-scoped rules load only when Claude reads a matching file.
* Record one `files[]` entry per group: `{name, paths?, obey, avoid}`.

### lint → linter config

Why (bugs / style / both) → recommend a tool for the stack
(biome / eslint / ruff / golangci-lint) with the trade-off → strictness →
record `tool`, `strict`, `style`.

**If the tool is `biome`, ask one more question — the ruleset** (`full` vs
`recommended`), and record `ruleset`. Recommendation-first, grounded in the size
of what Step 0 scanned: "I'd turn on Biome's full rule set — every stable rule,
nursery excluded — and opt out of the ones you reject with a written reason. On
a codebase this size the first run will report a lot; `recommended` is the
gentler start. Full?" Then make the severity consequence explicit, because it
decides whether the ruleset gates anything: rules outside the recommended set
default to *warn*, and `biome ci` exits 0 on warnings — so `full` with
`strict: false` reports without blocking. If the user wants that, record why.
Read `references/biome-ruleset.md` before asking.

### taskfile → Taskfile.yml

Why (one entrypoint vs remembered commands) → recommend Task, grounded in what
Step 0 found: "your lint command already appears in the README and the CI step —
a `Taskfile.yml` makes `task lint` the one place it lives; the trade-off is one
more tool to install." Task is the only runner Ymir generates; a user who wants
`make` or `just` skips the concern (`status: skipped` with the reason).

Then ask the two decisions, one message each:

* **The task list** — which actions deserve a task (`lint`, `test`, `build`,
  `dev`, `ci`). Derive the candidates from what the repo can already do and from
  the captured concerns; do not invent a task with no command behind it.
* **`wraps`** — `commands` (the task runs the tool directly) or `scripts` (the
  task calls an existing `package.json`/`Makefile` script). Ground it in Step 0:
  with real scripts already present, `scripts` avoids a second copy of every
  command; with none, `commands` makes the Taskfile the single owner.

Record `wraps` and one `tasks[]` entry per task (`name`, `desc`, `runs`). Read
`references/taskfile.md` before asking — it holds the naming set and the
semantics you must not improvise.

### ci → CI workflow

Why (gate PRs / catch regressions) → recommend the provider from `project.host`
(github → github-actions) → what it runs (`runs: [lint]`) → record. If `taskfile`
is captured, say plainly that CI will call `task <name>` rather than repeat the
commands.

### wiki / context

Why (shared project knowledge for Claude) → enabled? → collection name →
record `enabled`, `collection`.

### claude\_md → CLAUDE.md / AGENT.md

Why (what should steer the agent here) → recommend steer points derived from the
captured concerns (`lint-before-commit`, `point-to-wiki`, and `run-via-task`
whenever `taskfile` is captured — the agent should reach for `task <name>`
instead of reconstructing commands).

* For `claude-code`: do NOT add `point-to-rules` — `.claude/rules/` auto-loads.
* For `any`: rules content goes inline in `AGENT.md`; no separate rule files.
  Record `steer[]`.

## Greenfield fallback

If Step 0 found no signals (empty repo), there is no finding to cite. Ask the
purpose directly, recommend sensible defaults for the declared stack, and record
`findings: "missing — greenfield"`. This is the old onboarding behaviour, now a
special case rather than the default.

## Cross-concern consistency checklist (Step 2b)

After the sweep, check these enumerated couplings. On a conflict, surface it
plainly and **go back** to re-ask the implicated concern:

* `target_agent` ↔ `.claude/` presence: if `value: claude-code` but no `.claude/`
  was found in Step 0 (or vice versa), surface the mismatch and confirm.
* `target_agent` ↔ `wiki`: if `value: any` and wiki is captured+enabled, confirm
  the user understands the wiki guard degrades to a CI job (no PreToolUse hook).
* `lint.tool` ↔ `rules`: does a rule need enforcement the lint tool can't give? A
  purely architectural rule is fine as a `.claude/rules/` file for `claude-code`,
  or embedded in `AGENT.md` for `any` — but flag it if the user expected lint to
  enforce it.
* `rules` `paths` ↔ project layout: does each glob match real paths from Step 0?
  Flag a glob that matches nothing (likely a typo or a dead directory).
* `taskfile.tasks[]` ↔ `lint`: if both are captured there must be a `lint` task,
  and its `runs` must be the command the lint concern produces (for biome with
  `strict: true`, `biome ci --error-on-warnings .`). A `lint` task that runs a
  gentler command than the linter concern decided is a silently weakened gate.
* `taskfile.wraps` ↔ Step 0 scripts: `wraps: scripts` with no existing scripts to
  call has nothing to wrap; `wraps: commands` while the repo keeps scripts that
  run the same tools leaves two owners of one command. Surface either and confirm.
* `ci.runs[]` ↔ `taskfile.tasks[]`: every `ci.runs[]` entry should have a task of
  that name when `taskfile` is captured — otherwise CI ends up with its own copy
  of the command, which is what the Taskfile exists to prevent.
* `ci.provider` ↔ `project.host`: provider matches the host?
* `lint.strict` ↔ `project.layer`/`runtime`: strictness sensible for the stack?
* `lint.ruleset` ↔ `lint.strict` ↔ `ci.runs`: for biome, `ruleset: full` with
  `strict: false` while CI runs lint is a gate that can never fail — every rule
  the preset adds emits a warning and `biome ci` exits 0. Surface it and confirm
  the user wants advisory-only, or raise `strict`.
* `claude_md.steer` ↔ the captured concerns: steers toward the wiki/lint actually
  set up, and carries `run-via-task` when `taskfile` is captured (so the agent
  runs `task lint`, not a hand-rebuilt linter invocation);
  for `claude-code`, does NOT redundantly point at `.claude/rules/`;
  for `any`, rules are embedded inline, no `.claude/rules/` reference.

## Anti-patterns (do not do these)

* ❌ Asking "which tool?" with no *why* first — the bare field-question is the
  shallow failure this engine exists to remove.
* ❌ Batching multiple questions into one message.
* ❌ Accepting the first answer without grounding it in the Step 0 finding.
* ❌ Sweeping a concern the user has no need for instead of skipping it (YAGNI).
