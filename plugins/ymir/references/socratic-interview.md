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

- `present-strong` → confirm or tune what exists ("keep eslint as-is?").
- `present-weak` → name the weakness and propose strengthening.
- `missing` → propose adding — but apply **YAGNI**: if the user has no real need,
  record `status: skipped` with a reason instead of forcing it.

## Per-concern probe bank

### project / techstack (item 0)
Mostly **confirm** what Step 0 detected: "Detected TypeScript on bun, backend,
GitHub — right?" Only ask cold if detection was empty.

### rules → `.claude/rules/*.md` (special: scope probing)
Rules become native Claude Code path-scoped rule files. After the *why*:
- Elicit the conventions to **obey** and patterns to **avoid**.
- For each rule (group), ask its **scope**: project-wide (always-on, no `paths`)
  or scoped to files — "Does 'explicit return types' apply to all TS, or just
  `src/api/**`?" Path-scoped rules load only when Claude reads a matching file.
- Record one `files[]` entry per group: `{name, paths?, obey, avoid}`.

### lint → linter config
Why (bugs / style / both) → recommend a tool for the stack
(biome / eslint / ruff / golangci-lint) with the trade-off → strictness →
record `tool`, `strict`, `style`.

### ci → CI workflow
Why (gate PRs / catch regressions) → recommend the provider from `project.host`
(github → github-actions) → what it runs (`runs: [lint]`) → record.

### wiki / context
Why (shared project knowledge for Claude) → enabled? → collection name →
record `enabled`, `collection`.

### claude_md → CLAUDE.md / AGENT.md
Why (what should steer Claude here) → recommend steer points derived from
concerns 2-4 (`lint-before-commit`, `point-to-wiki`). **Do NOT** add a
`point-to-rules` steer — `.claude/rules/` auto-loads. Record `steer[]`.

## Greenfield fallback

If Step 0 found no signals (empty repo), there is no finding to cite. Ask the
purpose directly, recommend sensible defaults for the declared stack, and record
`findings: "missing — greenfield"`. This is the old onboarding behaviour, now a
special case rather than the default.

## Cross-concern consistency checklist (Step 2b)

After the sweep, check these enumerated couplings. On a conflict, surface it
plainly and **go back** to re-ask the implicated concern:

- `lint.tool` ↔ `rules`: does a rule need enforcement the lint tool can't give? A
  purely architectural rule is fine as a `.claude/rules/` file — but flag it if
  the user expected lint to enforce it.
- `rules` `paths` ↔ project layout: does each glob match real paths from Step 0?
  Flag a glob that matches nothing (likely a typo or a dead directory).
- `ci.provider` ↔ `project.host`: provider matches the host?
- `lint.strict` ↔ `project.layer`/`runtime`: strictness sensible for the stack?
- `claude_md.steer` ↔ concerns 2-4: steers toward the wiki/lint actually set up,
  and does **not** redundantly point at `.claude/rules/`.

## Anti-patterns (do not do these)

- ❌ Asking "which tool?" with no *why* first — the bare field-question is the
  shallow failure this engine exists to remove.
- ❌ Batching multiple questions into one message.
- ❌ Accepting the first answer without grounding it in the Step 0 finding.
- ❌ Sweeping a concern the user has no need for instead of skipping it (YAGNI).
