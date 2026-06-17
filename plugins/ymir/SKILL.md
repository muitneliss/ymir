---
name: ymir
description: Ymir interviews the user about THIS project (the current working directory) across a harness checklist, re-audits for completeness, and emits a SPEC under .ymir/ — it never writes harness files itself. The spec drives an LLM to generate the harness: rules, lint, CI lint, wiki/context, and CLAUDE.md/AGENT.md. Use whenever the user asks Ymir to do something to the project, e.g. "ymir init for this project", "ymir add lint", "ymir add rules", "ymir set up CI", "scaffold the harness", "bootstrap this repo".
argument-hint: "init | add lint | add rules | add ci | add context | add claude.md — what to do for this project"
---

# Ymir

Ymir produces a **harness spec** for the current project — never application code,
and never the harness files themselves. The user drives all real coding through
Claude Code; Ymir interviews, audits, and writes a spec that an LLM then follows
to generate the foundation that steers Claude Code:

1. **rules** — coding standards / conventions
2. **lint** — linter config for the chosen stack
3. **CI lint** — a CI workflow that runs the linter
4. **wiki / context** — a place for project knowledge
5. **CLAUDE.md / AGENT.md** — the file that steers Claude Code on this repo

The deliverable is two files under `.ymir/`:

- `.ymir/harness-profile.yaml` — the audited decisions (machine-readable).
- `.ymir/harness-playbook.md` — step-by-step generation instructions for an LLM.

**Ymir writes only these two files.** It does not create rules docs, lint configs,
CI workflows, the wiki, or `CLAUDE.md` — that is the downstream generation step.

## How this skill works

This is a single dispatcher. The user's words after `ymir` are the intent
(`$ARGUMENTS`) — interpret them and act on **this project** (cwd). Map the intent
to the checklist of harness concerns above. Examples:

| User says | Intent |
|---|---|
| `ymir init for this project` | sweep the whole checklist, audit, emit the spec |
| `ymir add lint for this project` | interview + audit only the `lint` concern; update the spec |
| `ymir add rules` | interview + audit only `rules`; update the spec |
| `ymir set up CI` | interview + audit only `ci`; update the spec |
| `ymir add context` / `ymir add wiki` | **scaffold the wiki directly** — execute the existing wiki flow (the one exception to spec-only); see "Wiki-only intent" below |
| anything ambiguous | ask a short clarifying question, then proceed |

If `$ARGUMENTS` is empty, treat it as `init`. If `.ymir/harness-profile.yaml`
already exists, read it first and ask only what is missing or requested
(idempotent / resumable).

### Wiki-only intent (the one exception to spec-only)

If — and only if — the intent is explicitly to create the wiki
(`ymir add context`, `ymir add wiki`), Ymir **executes** the wiki scaffold
immediately against the project, exactly as before: follow every step in
`${CLAUDE_PLUGIN_ROOT}/templates/playbook/wiki.md` (create the wiki tree, install
the PreToolUse hook, point CLAUDE.md at the wiki, verify with `wiki validate`, and
tell the user the qmd one-time setup). This is the only case where Ymir writes
project files.

For any broader intent (`ymir init`, or any other concern), Ymir stays spec-only:
the wiki is captured in the profile and written into `harness-playbook.md` as the
`wiki` section, and generation happens downstream.

## The checklist

The interview and the audit are driven by this checklist — one foundation item
plus the five concerns:

| # | Item | Drives |
|---|---|---|
| 0 | project / techstack | language, runtime, layer (frontend/backend/both), repo host |
| 1 | rules | conventions to obey / patterns to avoid |
| 2 | lint | linter tool, strictness, style |
| 3 | CI lint | CI provider, what it runs |
| 4 | wiki / context | enabled?, collection name |
| 5 | CLAUDE.md / AGENT.md | steering points (derived from 1–4) |

## Step 1 — Checklist-driven interview (socratic)

The user does not hand-write code, so Ymir cannot infer the stack from files.
Ask **one decision at a time** (`AskUserQuestion`), multiple-choice when possible.
Walk the checklist: item 0 first, then the in-scope concerns.

- For `ymir init`, sweep the whole checklist.
- For a narrow action (e.g. `add lint`), ask only item 0 (if not already in the
  profile) plus that one concern.
- The user may skip a concern → record `status: skipped` with a `reason`.
- Write each answer into `.ymir/harness-profile.yaml` as you go. Field shape and
  required-fields-per-status:
  `${CLAUDE_PLUGIN_ROOT}/templates/harness-profile.schema.md`.

## Step 2 — Re-audit (gate)

Before emitting, re-check every in-scope concern against the schema's required
fields (e.g. "have we clarified the techstack? the rules to obey/avoid? the lint
tool?"):

- Any required field missing → loop back and ask exactly that question; keep the
  concern `status: pending` until resolved.
- When all in-scope concerns are `captured` or `skipped`, print a coverage table
  (`✅ captured` / `⏭️ skipped` / `❌ pending`) and ask the user to confirm.

**Do not proceed to Step 3 while any in-scope concern is `pending`, or before the
user confirms the coverage table.**

## Step 3 — Emit the spec

Assemble the playbook from the bundled per-concern templates — do not free-form it:

1. Ensure `.ymir/harness-profile.yaml` reflects the final audited decisions.
2. Write `.ymir/harness-playbook.md`: start from
   `${CLAUDE_PLUGIN_ROOT}/templates/playbook/header.md` (fill `{{PROJECT}}` and
   `{{DATE}}`), then append one section per `captured` concern, copied from
   `${CLAUDE_PLUGIN_ROOT}/templates/playbook/<concern>.md`, filling any `{{...}}`
   placeholders from the profile. Omit `skipped` concerns.
3. Tell the user the spec is ready under `.ymir/`, and that a normal Claude Code
   session can now follow `harness-playbook.md` to generate the harness.

Never write the harness files themselves; only the two spec files above.

## Boundaries

- Operate on the current project only ("this project" = cwd).
- **Spec only, with one exception** — Ymir writes `.ymir/harness-profile.yaml`
  and `.ymir/harness-playbook.md`, nothing else, *except* the wiki-only intent
  (`ymir add context` / `ymir add wiki`), which executes the wiki scaffold
  directly (see "Wiki-only intent" above). Every other intent stays spec-only;
  generation is downstream.
- Prefer asking over assuming; the interview is the source of truth.
