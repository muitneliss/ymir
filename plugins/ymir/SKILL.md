---
name: ymir
description: Ymir explores THIS project's codebase (the current working directory), then runs a deep Socratic interview across a harness checklist, re-audits for completeness + consistency, and emits a SPEC under .ymir/ (the interview step writes only the spec). The spec covers rules, lint, CI lint, wiki/context, and CLAUDE.md/AGENT.md; 'ymir apply' then generates the harness from the spec (with backups + 'ymir revert'). Use whenever the user asks Ymir to do something to the project, e.g. "ymir init for this project", "ymir add lint", "ymir add rules", "ymir set up CI", "ymir apply", "ymir revert", "scaffold the harness", "bootstrap this repo".
argument-hint: "init | add lint | add rules | add ci | add context | add claude.md | apply [concern] | revert — what to do for this project"
---

# Ymir

Ymir produces a **harness spec** for the current project — never application code.
The *interview* step writes only the spec; `ymir apply` is the separate, explicit
step that generates the harness files from that spec. The foundation it generates
steers Claude Code:

1. **rules** — coding standards / conventions
2. **lint** — linter config for the chosen stack
3. **CI lint** — a CI workflow that runs the linter
4. **wiki / context** — a place for project knowledge
5. **CLAUDE.md / AGENT.md** — the file that steers Claude Code on this repo

The deliverable is two files under `.ymir/`:

- `.ymir/harness-profile.yaml` — the audited decisions (machine-readable).
- `.ymir/harness-playbook.md` — step-by-step generation instructions for an LLM.

**The interview step writes only these two files.** Generating the actual rules
docs, lint configs, CI workflows, wiki, or `CLAUDE.md` happens when you run
`ymir apply` (see "Applying the spec" below) — not during the interview.

## How this skill works

This is a single dispatcher. The user's words after `ymir` are the intent
(`$ARGUMENTS`) — interpret them and act on **this project** (cwd). Map the intent
to the checklist of harness concerns above. Examples:

| User says | Intent |
|---|---|
| `ymir init for this project` | understand the codebase, sweep the checklist, audit, emit the spec |
| `ymir add lint for this project` | interview + audit only the `lint` concern; update the spec |
| `ymir add rules` | interview + audit only `rules`; update the spec |
| `ymir set up CI` | interview + audit only `ci`; update the spec |
| `ymir add context` / `ymir add wiki` | **scaffold the wiki directly** — execute the existing wiki flow (the one exception to spec-only); see "Wiki-only intent" below |
| `ymir apply` | generate the harness from the spec: preview → confirm → per concern (keep/merge/overwrite, backing up first) → verify all → summary; see "Applying the spec" below |
| `ymir apply lint` (or any concern) | apply only that one concern from the spec |
| `ymir revert` | restore the files the most recent `ymir apply` overwrote/merged, from `*.backup.<run-id>`; see "Reverting an apply" below |
| anything ambiguous | ask a short clarifying question, then proceed |

If `$ARGUMENTS` is empty, treat it as `init`. If `.ymir/harness-profile.yaml`
already exists, read it first and ask only what is missing or requested
(idempotent / resumable).

### Wiki-only intent (the one exception to spec-only)

If — and only if — the intent is explicitly to create the wiki
(`ymir add context`, `ymir add wiki`), Ymir **executes** the wiki scaffold
immediately against the project via **a single CLI call** — never by hand-editing
files. The CLI owns the tree, the PreToolUse hook, the `.claude/settings.json`
entry, the `CLAUDE.md` block, and the validation step. From the project root:

```bash
"${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki" --root ./wiki init
```

It is idempotent (safe to re-run); on success the last line is `wiki valid`. If it
errors, stop and report. Then tell the user the qmd one-time setup (also in
`wiki/SCHEMA.md`): `qmd collection add ./wiki --name <project>-wiki`. Search is
keyword-only (BM25) — no `qmd embed`; re-run `qmd collection add` to refresh after
adding pages. This is the only case where Ymir writes project files.

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

## Step 0 — Understand the project (codebase-first)

Before asking anything, scan the repo and build a **gap report**. Detect the
foundation (language, runtime, layer, host) from manifests (`package.json`,
`go.mod`, `pyproject.toml`, …), lockfiles, and the `.git` remote; and per concern
detect current state + a verdict — `present-strong`, `present-weak`, or `missing`:

- `rules`: existing `.claude/rules/*.md`, conventions docs, `.editorconfig`, a
  `CLAUDE.md`/`AGENT.md` rules section.
- `lint`: a linter config present? which tool? strict?
- `ci`: workflows present? what do they run?
- `wiki`: a docs/context/wiki dir already used for project knowledge?
- `claude_md`: `CLAUDE.md`/`AGENT.md` present? what does it steer?

Print a one-line-per-concern findings summary so the interview is visibly
grounded. **Greenfield fallback:** if there are no usable signals, mark every
concern `missing` and proceed to ask cold.

## Step 1 — Per-concern Socratic interview

Walk item 0 (techstack — mostly **confirm** what Step 0 detected) then each
in-scope concern. For each concern run the 4-move engine — **probe why → recommend
(2-3 trade-offs, recommendation first) → adaptive follow-up only when needed →
confirm** — asking **one question per `AskUserQuestion` message**. The full engine,
the per-concern probe bank, the rules scope-probing, and the greenfield phrasing
live in `${CLAUDE_PLUGIN_ROOT}/references/socratic-interview.md` — read it before
interviewing.

- For `ymir init`, sweep the whole checklist; for a narrow action (e.g. `add
  lint`), run item 0 (if unknown) plus that one concern.
- The user may skip a concern → record `status: skipped` with a `reason`.
- Write each answer into `.ymir/harness-profile.yaml` as you go, including
  `why`, `findings`, and `alternatives_considered`. Field shape:
  `${CLAUDE_PLUGIN_ROOT}/templates/harness-profile.schema.md`.

## Step 2 — Consistency + re-audit (gate)

Before emitting:

1. **Required-field check** — every in-scope concern has its decision fields plus
   `why` and `findings`. Anything missing → keep the concern `pending` and loop
   back to ask exactly that.
2. **Cross-concern consistency pass** — run the bounded checklist in
   `references/socratic-interview.md` ("Cross-concern consistency checklist"). On a
   conflict, surface it plainly and **go back** to re-ask the implicated concern.
3. **Reflection gate** — print, per concern, `decision + one-line why` (with
   `✅ captured` / `⏭️ skipped` / `❌ pending` markers) and ask: *"Does this reflect
   your intent? Want to revisit any concern before I write the spec?"*

**Do not proceed to Step 3 while any in-scope concern is `pending`, or before the
user confirms the reflection summary.**

## Step 3 — Emit the spec

Assemble the playbook from the bundled per-concern templates — do not free-form it:

1. Ensure `.ymir/harness-profile.yaml` reflects the final audited decisions
   (`spec_version: 2`).
2. Write `.ymir/harness-playbook.md`: start from
   `${CLAUDE_PLUGIN_ROOT}/templates/playbook/header.md` (fill `{{PROJECT}}` and
   `{{DATE}}`), then append one section per `captured` concern from
   `${CLAUDE_PLUGIN_ROOT}/templates/playbook/<concern>.md`, filling every `{{...}}`
   placeholder (including the `Why / Findings` block) from the profile. Omit
   `skipped` concerns.
3. Tell the user the spec is ready under `.ymir/`.

(Spec-generation only — never write harness files here; `ymir apply` does that.)

## Step 4 — Spec-review gate

After emitting, before offering apply, ask the user to review the written files:

> "Spec written to `.ymir/harness-profile.yaml` and `.ymir/harness-playbook.md`.
> Please review them and tell me if you want any changes before I generate the
> harness."

Wait. On a change request, revisit the relevant concern, re-emit, and return to
this gate. Only on approval proceed to Step 5.

## Step 5 — Offer to apply (the full flow is init → apply)

After the user approves the spec, **ask** (via `AskUserQuestion`) whether to
generate it now:

> "Generate the harness now with `ymir apply`?"

- **Yes** → proceed into the "Applying the spec" flow below, in this same session.
- **No** → tell the user they can run `ymir apply` whenever they're ready; stop here.

For a narrow intent (e.g. `ymir add lint`), offer `ymir apply lint` — apply just
that one concern. Never auto-run apply without a yes; apply writes files.

## Applying the spec — `ymir apply` (writes the harness)

`ymir apply` is the explicit, user-triggered step that turns the spec into real
harness files. It never invents a spec: if `.ymir/harness-profile.yaml` or
`.ymir/harness-playbook.md` is missing, stop and tell the user to run `ymir init`
first.

**Scope.** `ymir apply` applies every `captured` concern in the profile.
`ymir apply <concern>` (e.g. `ymir apply lint`) applies only that concern.

**1 — Load + preview.** Read the profile and the playbook. For each in-scope
concern, read its `**Target:**` line from the playbook section to learn the
artifact (a literal path, a directory like `.claude/rules/`, or a tool/provider-derived
one such as the linter config for `concerns.lint.tool` or a workflow under
`.github/workflows/`). Test whether that artifact already exists and print a plan
table:

| Concern | Target | State | Planned action |
|---|---|---|---|
| rules | `.claude/rules/` | missing | create |
| lint | `eslint.config.mjs` | exists | ask keep/merge/overwrite |
| wiki | `wiki/` | missing | create |

**2 — Confirm once.** Ask the user to confirm the whole plan a single time before
writing anything.

**3 — Capture a run-id.** Capture one timestamp for the entire run:
`run_id=$(date +%Y%m%d%H%M%S)`. Every backup this run makes reuses this same
`run_id` so `ymir revert` can restore them as one group.

**4 — Execute each in-scope concern**, in playbook order:

- **Target missing** → generate it by following that concern's playbook Steps.
- **Target exists** → ask **keep / merge / overwrite** (`AskUserQuestion`):
  - *keep* → write nothing.
  - *merge* → `cp "<file>" "<file>.backup.$run_id"`, then fold the spec-driven
    changes into the existing file, guided by the playbook Steps.
  - *overwrite* → `cp "<file>" "<file>.backup.$run_id"`, then write the freshly
    generated artifact.
- **Directory target (e.g. `.claude/rules/`)** → treat each file in it as its own
  artifact: test existence, ask keep/merge/overwrite, and back up **per file**
  (`cp "<file>" "<file>.backup.$run_id"`) so `ymir revert` restores them
  individually.
- **Rule:** back up **before** any overwrite or merge; never back up a file you
  are creating fresh.

**5 — Verify all.** Run **every** in-scope concern's `**Verify:**` step. Do **not**
stop on the first failure — run them all and collect the results.

**6 — Summary table.** Print one row per concern and finish with the revert hint:

| Concern | Result |
|---|---|
| rules | ✅ generated + verified |
| lint | ⏭️ kept (existing) |
| ci | 🔁 merged + verified |
| wiki | ❌ verify failed — `<reason>` |

End by telling the user: `ymir revert` undoes this run (run-id `<run_id>`).

## Reverting an apply — `ymir revert`

`ymir revert` restores the files the most recent `ymir apply` overwrote or merged.

1. **Find the latest run-id.** List backups under the project and take the
   greatest `<run-id>` suffix (timestamps sort lexically):
   ```bash
   find . -name '*.backup.*' 2>/dev/null | sed 's/.*\.backup\.//' | sort -u | tail -1
   ```
2. **Restore each backup of that run-id:** for every `<file>.backup.<run-id>`, run
   `mv "<file>.backup.<run-id>" "<file>"` (overwriting the applied version).
3. **Report** which files were restored.

**Limitation (by design — no manifest):** revert only restores files that have a
`.backup.<run-id>` — i.e. ones apply overwrote or merged. Files apply created from
scratch have no backup; they remain and show up in `git status`. Remove them
manually or with `git clean` for a full undo.

## Boundaries

- Operate on the current project only ("this project" = cwd).
- **Spec generation is spec-only.** The interview intents (`ymir init`,
  `ymir add <concern>`) write only `.ymir/harness-profile.yaml` and
  `.ymir/harness-playbook.md`. Two intents write harness files on purpose:
  `ymir apply` (generates the harness from the spec, with backups) and
  `ymir revert` (restores those backups). The wiki-only shortcut
  (`ymir add context` / `ymir add wiki`) also executes directly; `ymir apply wiki`
  reaches the same result through the general apply path.
- Prefer asking over assuming — but ground the asking in what the codebase
  actually shows (Step 0). The interview is the source of truth.
- The `rules` concern emits native `.claude/rules/*.md` (path-scoped), not a
  `docs/rules.md`; `CLAUDE.md` does not point at them (auto-discovered).
