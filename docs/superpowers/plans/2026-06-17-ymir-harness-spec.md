# Ymir Harness Spec Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the `/ymir` skill from a 2-step scaffolder into a 3-step **harness-spec generator** that interviews across a checklist, re-audits for completeness, and emits a spec under `.ymir/` (never writes harness files).

**Architecture:** The skill assembles two spec files — `.ymir/harness-profile.yaml` (audited decisions) and `.ymir/harness-playbook.md` (per-concern generation steps for a downstream LLM) — from bundled per-concern playbook-section templates plus a profile schema reference. The existing wiki tooling (CLI, templates, hook) is untouched; the wiki procedure currently inline in `SKILL.md` is relocated into a playbook template the spec references.

**Tech Stack:** Markdown skill content + markdown templates. No executable code is added (validation stays inline per the spec's YAGNI default). Verification is structural (`test -f`, `grep`).

## Global Constraints

- **Spec only:** the skill writes exactly two files — `.ymir/harness-profile.yaml` and `.ymir/harness-playbook.md`. It never writes rules docs, lint configs, CI workflows, the wiki, or `CLAUDE.md`. Generation is downstream.
- Operate on the current project only (cwd).
- **Do not modify** `plugins/ymir/wiki-cli/`, `plugins/ymir/templates/wiki/`, or `plugins/ymir/templates/hooks/` — the wiki playbook section references them.
- No new tooling / no validator binary (validation is inline prose against the schema doc).
- Exact artifact paths: profile `.ymir/harness-profile.yaml`; playbook `.ymir/harness-playbook.md`; schema ref `plugins/ymir/templates/harness-profile.schema.md`; playbook section templates `plugins/ymir/templates/playbook/<name>.md`.
- Checklist items: `project` (item 0) + concerns `rules`, `lint`, `ci`, `wiki`, `claude_md`. Concern `status` ∈ `captured | skipped | pending`.
- Commits: no `Co-authored-by` trailer.

---

### Task 1: Profile schema reference

**Files:**
- Create: `plugins/ymir/templates/harness-profile.schema.md`

**Interfaces:**
- Produces: the field contract for `.ymir/harness-profile.yaml` — top-level keys (`meta.*`, `project.*`, `concerns.<name>.status`), the three statuses, and required-fields-per-concern. Tasks 2 and 3 reference this file by path.

- [ ] **Step 1: Create the schema reference file**

Create `plugins/ymir/templates/harness-profile.schema.md` with exactly this content:

````markdown
# Harness Profile — Shape & Required Fields

`.ymir/harness-profile.yaml` records the audited interview decisions. Ymir writes
it; the re-audit gate checks it. It is the machine-readable half of the harness
spec (the LLM-facing half is `.ymir/harness-playbook.md`).

## Top level

| Key | Required | Notes |
|---|---|---|
| `meta.project` | yes | base name of the project directory |
| `meta.generated_by` | yes | always `ymir` |
| `meta.generated_at` | yes | ISO date (YYYY-MM-DD) |
| `meta.spec_version` | yes | integer; `1` for this schema |
| `project.language` | yes | e.g. `typescript`, `go` |
| `project.layer` | yes | `frontend` \| `backend` \| `both` |
| `project.runtime` | recommended | e.g. `bun`, `node`, or omit if none |
| `project.host` | recommended | repo host → drives CI provider (e.g. `github`) |
| `concerns.<name>.status` | yes | one of the statuses below |

## Concern statuses

- `captured` — interviewed; the required fields below are present.
- `skipped` — user chose not to set this concern up; include a `reason`.
- `pending` — raised but unresolved. **The audit blocks emission while any
  in-scope concern is `pending`.**

## Required fields per concern (only when `status: captured`)

| Concern | Required when captured |
|---|---|
| `rules` | at least one of `obey[]` / `avoid[]` (or both empty with a `note: "no special rules"`) |
| `lint` | `tool` |
| `ci` | `provider`, `runs[]` |
| `wiki` | `enabled`; and if `enabled: true`, then `collection` |
| `claude_md` | `steer[]` |

## Example

```yaml
meta:    { project: acme-api, generated_by: ymir, generated_at: 2026-06-17, spec_version: 1 }
project: { language: typescript, runtime: bun, layer: backend, host: github }
concerns:
  rules:     { status: captured, obey: [functional-core-imperative-shell, explicit-return-types], avoid: [any, default-exports, throw-as-control-flow] }
  lint:      { status: captured, tool: biome, strict: true, style: { indent: tab, quotes: single } }
  ci:        { status: captured, provider: github-actions, runs: [lint] }
  wiki:      { status: captured, enabled: true, collection: acme-api-wiki }
  claude_md: { status: captured, steer: [point-to-rules, point-to-wiki, lint-before-commit] }
```
````

- [ ] **Step 2: Verify the file exists and is complete**

Run: `test -f plugins/ymir/templates/harness-profile.schema.md && grep -c -E 'captured|skipped|pending|Required when captured' plugins/ymir/templates/harness-profile.schema.md`
Expected: exit 0; count `>= 4` (statuses + required-fields heading present).

- [ ] **Step 3: Commit**

```bash
git add plugins/ymir/templates/harness-profile.schema.md
git commit -m "feat(ymir): add harness-profile.yaml schema reference"
```

---

### Task 2: Playbook section templates

**Files:**
- Create: `plugins/ymir/templates/playbook/header.md`
- Create: `plugins/ymir/templates/playbook/rules.md`
- Create: `plugins/ymir/templates/playbook/lint.md`
- Create: `plugins/ymir/templates/playbook/ci.md`
- Create: `plugins/ymir/templates/playbook/wiki.md`
- Create: `plugins/ymir/templates/playbook/claude_md.md`

**Interfaces:**
- Consumes: profile keys defined in Task 1 (e.g. `concerns.rules.obey`, `meta.project`).
- Produces: six templates Task 3's Step 3 assembles into `.ymir/harness-playbook.md`. Placeholder convention: `{{PROJECT}}`, `{{DATE}}`, `{{collection}}`. The `wiki.md` template is the relocated wiki procedure (moved out of `SKILL.md` in Task 3).

- [ ] **Step 1: Create the header template**

Create `plugins/ymir/templates/playbook/header.md`:

```markdown
# Harness Generation Playbook — {{PROJECT}}

> Generated by Ymir on {{DATE}}. This playbook DRIVES an LLM to generate the
> project harness. Ymir itself wrote no harness files — only this spec and
> `.ymir/harness-profile.yaml`.
>
> **How to use:** read `.ymir/harness-profile.yaml` for decisions, then follow
> the per-concern sections below. Each section lists the profile keys it
> consumes (Inputs), the generation Steps, and how to Verify the result.
```

- [ ] **Step 2: Create the `rules` section template**

Create `plugins/ymir/templates/playbook/rules.md`:

```markdown
## rules → project rules doc

- **Inputs:** `concerns.rules.obey[]`, `concerns.rules.avoid[]`
- **Steps:**
  1. Create `docs/rules.md` (or the project's existing conventions doc).
  2. Add a top **"NEVER"** list — one bullet per `avoid[]` item.
  3. Add sections (Naming, Error handling, Module boundaries) phrased from the
     `obey[]` items.
- **Verify:** `docs/rules.md` exists; every `avoid[]` item appears in the NEVER
  list.
```

- [ ] **Step 3: Create the `lint` section template**

Create `plugins/ymir/templates/playbook/lint.md`:

```markdown
## lint → linter config

- **Inputs:** `project.language`, `project.runtime`, `concerns.lint.tool`,
  `concerns.lint.strict`, `concerns.lint.style`
- **Steps:**
  1. Generate the config file for `concerns.lint.tool` (e.g. `biome.json`,
     `.golangci.yml`) using `strict` and `style`.
  2. Add a `lint` (and `lint:fix` where supported) script/target appropriate to
     `project.runtime`.
- **Verify:** the lint command runs clean on a fresh checkout.
```

- [ ] **Step 4: Create the `ci` section template**

Create `plugins/ymir/templates/playbook/ci.md`:

```markdown
## CI lint → CI workflow

- **Inputs:** `project.host`, `project.runtime`, `concerns.ci.provider`,
  `concerns.ci.runs[]`
- **Steps:**
  1. Create the CI workflow for `concerns.ci.provider` (e.g.
     `.github/workflows/ci.yml` for GitHub Actions).
  2. Add a job that installs deps for `project.runtime` and runs each entry in
     `concerns.ci.runs[]` (e.g. `lint`).
- **Verify:** the workflow file is valid YAML and runs the same lint command the
  `lint` concern produced.
```

- [ ] **Step 5: Create the `wiki` section template (relocated procedure)**

Create `plugins/ymir/templates/playbook/wiki.md`:

```markdown
## wiki / context → LLM-maintained wiki

- **Inputs:** `concerns.wiki.enabled`, `concerns.wiki.collection`, `meta.project`
- **Steps:** (only if `concerns.wiki.enabled: true`)
  1. **Create the tree** under the project root: `wiki/raw/`, `wiki/sources/`,
     `wiki/notes/` — each with a `.gitkeep` (copy
     `${CLAUDE_PLUGIN_ROOT}/templates/wiki/gitkeep`).
  2. `wiki/SCHEMA.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/SCHEMA.md`,
     then replace the literal `PROJECT_NAME` with `meta.project`.
  3. `wiki/index.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/index.seed.md`.
  4. `wiki/log.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/log.seed.md`.
  5. **Install the hook:** copy
     `${CLAUDE_PLUGIN_ROOT}/templates/hooks/block-wiki-edits.mjs` to
     `.claude/hooks/block-wiki-edits.mjs`; merge
     `${CLAUDE_PLUGIN_ROOT}/templates/hooks/settings.snippet.json` into
     `.claude/settings.json` (deep-merge the `hooks.PreToolUse` array; never
     clobber existing hooks).
  6. **Point CLAUDE.md at the wiki:** append (creating the file if absent):

     ```markdown
     ## Wiki / Context
     This project has an LLM-maintained wiki under `wiki/`. You MUST NOT hand-edit
     wiki docs (`wiki/sources`, `wiki/notes`, `index.md`, `log.md`) — they are
     managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
     `wiki/SCHEMA.md` for the rules and command reference.
     ```
  7. **Tell the user** the qmd one-time setup:
     `qmd collection add ./wiki --name {{collection}} && qmd embed`.
- **Verify:** run
  `${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki validate` and confirm it
  prints `wiki valid`.
```

- [ ] **Step 6: Create the `claude_md` section template**

Create `plugins/ymir/templates/playbook/claude_md.md`:

```markdown
## CLAUDE.md / AGENT.md → steering file

- **Inputs:** `concerns.claude_md.steer[]`, plus the other captured concerns
- **Steps:**
  1. Create or extend `CLAUDE.md` at the project root.
  2. For each `steer[]` point, add a short directive — e.g. `point-to-rules`
     links `docs/rules.md`; `point-to-wiki` links `wiki/SCHEMA.md`;
     `lint-before-commit` tells Claude to run the lint command before commits.
- **Verify:** `CLAUDE.md` exists and references every captured concern's artifact.
```

- [ ] **Step 7: Verify all six templates exist with the right shape**

Run: `ls plugins/ymir/templates/playbook/ | sort | tr '\n' ' '`
Expected: `ci.md claude_md.md header.md lint.md rules.md wiki.md `

Run: `grep -l 'Inputs:' plugins/ymir/templates/playbook/rules.md plugins/ymir/templates/playbook/lint.md plugins/ymir/templates/playbook/ci.md plugins/ymir/templates/playbook/wiki.md plugins/ymir/templates/playbook/claude_md.md | wc -l`
Expected: `5`

Run: `grep -c 'wiki-cli/bin/wiki --root ./wiki validate' plugins/ymir/templates/playbook/wiki.md`
Expected: `1` (the relocated wiki verify step is present).

- [ ] **Step 8: Commit**

```bash
git add plugins/ymir/templates/playbook/
git commit -m "feat(ymir): add per-concern playbook section templates"
```

---

### Task 3: Rewrite SKILL.md to the 3-step spec-generator flow

**Files:**
- Modify: `plugins/ymir/SKILL.md` (full rewrite of body; remove inline wiki scaffold)

**Interfaces:**
- Consumes: `plugins/ymir/templates/harness-profile.schema.md` (Task 1) and `plugins/ymir/templates/playbook/*.md` (Task 2), referenced via `${CLAUDE_PLUGIN_ROOT}`.
- Produces: the new dispatcher behavior — Step 1 interview → Step 2 audit gate → Step 3 emit `.ymir/` spec.

**Behavior change to note in the commit:** `/ymir add context` (and `init`) no longer scaffolds the wiki inline; it now records the wiki decision in the spec, and the relocated `wiki.md` playbook section drives the actual wiki scaffold downstream.

- [ ] **Step 1: Replace the entire contents of `plugins/ymir/SKILL.md`**

Overwrite `plugins/ymir/SKILL.md` with exactly:

````markdown
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
| anything ambiguous | ask a short clarifying question, then proceed |

If `$ARGUMENTS` is empty, treat it as `init`. If `.ymir/harness-profile.yaml`
already exists, read it first and ask only what is missing or requested
(idempotent / resumable).

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
- **Spec only** — Ymir writes `.ymir/harness-profile.yaml` and
  `.ymir/harness-playbook.md`, nothing else. Generation is downstream.
- Prefer asking over assuming; the interview is the source of truth.
````

- [ ] **Step 2: Verify the rewrite (structure present, inline scaffold gone)**

Run: `grep -c -E '^## Step [123] —' plugins/ymir/SKILL.md`
Expected: `3`

Run: `grep -c 'Spec only' plugins/ymir/SKILL.md`
Expected: `1`

Run: `grep -c 'templates/playbook/header.md' plugins/ymir/SKILL.md`
Expected: `1`

Run: `grep -c 'Create the tree' plugins/ymir/SKILL.md`
Expected: `0` (the inline wiki scaffold procedure has been relocated out of SKILL.md)

- [ ] **Step 3: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "feat(ymir): rewrite SKILL.md as 3-step harness-spec generator

Interview (checklist) -> re-audit gate -> emit .ymir/ spec. Wiki is no
longer scaffolded inline; its procedure moves to a playbook template and
the spec drives generation downstream."
```

---

### Task 4: Reframe README.md and plugin.json

**Files:**
- Modify: `README.md`
- Modify: `plugins/ymir/.claude-plugin/plugin.json:4`

**Interfaces:**
- Consumes: nothing from other tasks (documentation only).
- Produces: user-facing description consistent with the spec-generator model.

- [ ] **Step 1: Update the plugin.json description**

In `plugins/ymir/.claude-plugin/plugin.json`, replace the `description` value:

Old:
```json
  "description": "Scaffolds a project harness — rules, lint, CI lint, wiki/context, and CLAUDE.md — by interviewing the user about their techstack. Builds only the skeleton; never generates application code.",
```
New:
```json
  "description": "Interviews the user about THIS project across a harness checklist (rules, lint, CI lint, wiki/context, CLAUDE.md), re-audits for completeness, and emits a spec under .ymir/ that drives an LLM to generate the harness. Writes only the spec — never harness or application code.",
```

- [ ] **Step 2: Update the README intro paragraph**

In `README.md`, replace the intro (the two paragraphs after the badges, lines describing what Ymir does):

Old:
```markdown
A Claude Code plugin marketplace + plugin that scaffolds the **mandatory project
harness** every repo should start with — rules, lint, CI lint, wiki/context, and
`CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code. It interviews you about your
techstack (Go vs TypeScript, frontend vs backend, …) and builds only the
skeleton. You then drive the actual development through Claude Code, guided by the
harness Ymir laid down.
```
New:
```markdown
A Claude Code plugin marketplace + plugin that produces a **harness spec** for a
repo — rules, lint, CI lint, wiki/context, and `CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code, and it does **not** write the harness
files itself. It interviews you across a checklist of harness concerns, re-audits
to confirm nothing is missing, and emits a spec under `.ymir/`:

- `.ymir/harness-profile.yaml` — your audited decisions (machine-readable).
- `.ymir/harness-playbook.md` — step-by-step instructions an LLM follows to
  generate the harness.

You then drive generation through a normal Claude Code session, guided by the spec
Ymir produced.
```

- [ ] **Step 3: Update the README Status section**

In `README.md`, replace the `## Status` section:

Old:
```markdown
## Status

`v0.2.0`. The **wiki / context** harness piece is implemented: `/ymir add
context` scaffolds an LLM-maintained `wiki/` (backed by the bundled wiki CLI in
`plugins/ymir/wiki-cli`), installs a PreToolUse hook that blocks hand-editing
wiki docs, and wires in `qmd` for search. The socratic interview and the other
harness pieces (lint, CI, rules) are still stubbed.
```
New:
```markdown
## Status

`v0.2.0`. Ymir runs a 3-step flow: a checklist-driven socratic interview, a
re-audit gate, and a spec emitted to `.ymir/` (`harness-profile.yaml` +
`harness-playbook.md`). The spec's per-concern playbook sections live in
`plugins/ymir/templates/playbook/`. The **wiki / context** section drives the
bundled wiki tooling (`plugins/ymir/wiki-cli`, templates, and the PreToolUse hook
that blocks hand-editing wiki docs). The skill itself writes only the spec;
generating the harness from it is a downstream Claude Code step.
```

- [ ] **Step 4: Verify the doc updates landed**

Run: `grep -c 'harness spec' README.md`
Expected: `>= 1`

Run: `grep -c 'emits a spec under .ymir/' plugins/ymir/.claude-plugin/plugin.json`
Expected: `1`

Run: `grep -c 'templates/playbook/' README.md`
Expected: `1`

- [ ] **Step 5: Commit**

```bash
git add README.md plugins/ymir/.claude-plugin/plugin.json
git commit -m "docs(ymir): reframe README + plugin.json as harness-spec generator"
```

---

## Notes for the implementer

- This feature adds **no executable code**. Do not add a validator binary or new
  CLI commands — the audit is performed by the skill (the LLM) reading the schema
  doc inline. If a programmatic validator is wanted later, it is a separate plan.
- Do not touch `plugins/ymir/wiki-cli/`, `plugins/ymir/templates/wiki/`, or
  `plugins/ymir/templates/hooks/`. The wiki playbook section references them by
  `${CLAUDE_PLUGIN_ROOT}` path.
- After Task 4, optionally dogfood: in a throwaway directory, mentally run the
  3-step flow and confirm a `.ymir/harness-profile.yaml` would satisfy the schema
  and that `harness-playbook.md` would contain a section per captured concern.
  (Interactive; not an automated test.)
```
