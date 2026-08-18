---
title: Socratic Interview Flow
type: concept
date: 2026-08-18
tags: []
source_count: 0
---

# Socratic Interview Flow

Ymir's Step 1 interview runs as a codebase-first Socratic dialogue rather than a schema-driven form-fill. The cardinal rule is one question per message: every question is its own `AskUserQuestion` call, and the agent stops and yields the floor after each one — questions are never batched.

Before interviewing, Step 0 scans the repo and produces a gap report: for each concern (rules, lint, ci, wiki, claude\_md) a verdict of `present-strong`, `present-weak`, or `missing`, plus what was detected. Every question in Step 1 is grounded in that finding.

For each in-scope concern, in checklist order, Ymir runs a 4-move loop:

1. Probe the *why* — an open question grounded in the Step 0 finding (not "which linter?" but "I see no linter and mixed quote styles in `src/` — are you after bugs, style, or both?").
2. Recommend with trade-offs — 2-3 grounded options, leading with a pick and the reasoning, inviting challenge.
3. Adaptive follow-up — asked only if the answer reveals a gap, surprise, or contradiction; otherwise skip straight to confirm.
4. Confirm + record — write `decision`, `why`, `findings`, and `alternatives_considered` into `.ymir/harness-profile.yaml`, then advance.

Grounding by verdict: `present-strong` confirms or tunes what exists; `present-weak` names the weakness and proposes strengthening; `missing` proposes adding but applies YAGNI — a concern the user has no real need for is recorded `status: skipped` with a reason instead of forced.

After the per-concern sweep, Step 2 runs a required-field check, a bounded cross-concern consistency pass (enumerated couplings like `lint.tool` ↔ `rules`, `ci.provider` ↔ `project.host`) that surfaces conflicts and goes back to re-ask the implicated concern, and a reflection gate that prints each concern's decision + one-line why and asks the user to confirm or revisit before the spec is written.

See [[Socratic Interview Reference]] for the full engine detail (per-concern probe bank, greenfield fallback, anti-patterns), [[Ymir Socratic Interview Design]] for the design rationale, and [[Ymir SKILL Dispatcher]] for how Steps 0-5 fit into the overall `ymir init`/`ymir apply` flow.
