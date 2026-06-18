# Ymir Socratic Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ymir's harness interview from a schema-driven form-fill into a codebase-first, deep Socratic dialogue that captures the *why*, checks cross-concern consistency, and emits native `.claude/rules/` for the rules concern.

**Architecture:** Edit the *interview half* of one skill. Move the detailed interview mechanics into a new bundled reference doc; keep `SKILL.md` lean and pointing to it. Bump the profile schema to v2 (per-concern `why`/`findings`/`alternatives_considered`; `rules` becomes a `files[]` list targeting `.claude/rules/`). `ymir apply`/`revert` stay intact except for accepting a directory-valued `Target` for rules.

**Tech Stack:** Markdown skill files + YAML profile schema (prose/config, not compiled code). No test framework — verification is `rg`/`grep` structural checks plus a documented manual dry-run protocol (the skill is executed interactively by Claude).

**Spec:** `docs/superpowers/specs/2026-06-18-ymir-socratic-interview-design.md`

## Global Constraints

- The interview steps write **only** `.ymir/harness-profile.yaml` and `.ymir/harness-playbook.md` (spec-only). The single exception is the wiki-only intent (`ymir add context`/`ymir add wiki`), unchanged.
- The **five concerns are fixed** (rules, lint, ci, wiki, claude_md) + foundation item 0 (project/techstack). Never drop, add, or reorder them.
- Questions use `AskUserQuestion`, **one question per message**, multiple-choice preferred, open-ended where it surfaces the *why*.
- `meta.spec_version` becomes `2`. `why` and `findings` are **required when a concern is `captured`**; `alternatives_considered` is recommended.
- `rules` emits native **`.claude/rules/<name>.md`** files with optional `paths:` YAML frontmatter (omit = always-on). No `docs/rules.md`. `CLAUDE.md` must **not** point at `.claude/rules/` (auto-discovered).
- `ymir apply`/`ymir revert` mechanics are unchanged **except** the playbook `**Target:**` parser must accept a directory (`.claude/rules/`) for the rules concern.
- Git: commit per task. **Do NOT add a co-authored trailer** (user rule). Work in place in the current worktree.
- Plugin root at runtime is `${CLAUDE_PLUGIN_ROOT}` = `plugins/ymir/`.

---

### Task 1: Schema v2 — `harness-profile.schema.md`

**Files:**
- Modify: `plugins/ymir/templates/harness-profile.schema.md`

**Interfaces:**
- Produces (consumed by Tasks 3 & 4): `meta.spec_version: 2`; per-concern `why` (string, required when captured), `findings` (string, required when captured), `alternatives_considered` (list, optional); `rules.files[]` where each entry is `{name: string, paths?: string[], obey?: string[], avoid?: string[]}`.

- [ ] **Step 1: Write the verification check (expect FAIL)**

Run:
```bash
rg -n "spec_version.*\b2\b|files\[\]|alternatives_considered" plugins/ymir/templates/harness-profile.schema.md
```
Expected: no matches (exit 1) — the schema is still v1.

- [ ] **Step 2: Bump `spec_version` and add the rationale fields**

In the "Top level" table, change the `meta.spec_version` row note to:
```markdown
| `meta.spec_version` | yes | integer; `2` for this schema |
```

Replace the "Required fields per concern" table so it reads:
```markdown
## Required fields per concern (only when `status: captured`)

Every captured concern additionally requires `why` (string — the pain/goal the
user expressed) and `findings` (string — what the Step 0 codebase scan saw + a
verdict of `present-strong` / `present-weak` / `missing`). `alternatives_considered`
(list) is recommended.

| Concern | Required when captured (besides `why` + `findings`) |
|---|---|
| `rules` | at least one `files[]` entry; each entry needs a `name` and at least one of `obey[]` / `avoid[]` |
| `lint` | `tool` |
| `ci` | `provider`, `runs[]` |
| `wiki` | `enabled`; and if `enabled: true`, then `collection` |
| `claude_md` | `steer[]` |
```

- [ ] **Step 3: Document the `rules.files[]` shape and v1→v2 migration**

Add this section after the table:
```markdown
## `rules.files[]` — one native `.claude/rules/` file per entry

Each entry maps to `.claude/rules/<name>.md`:

| Key | Required | Notes |
|---|---|---|
| `name` | yes | kebab-case; becomes the filename (`<name>.md`) |
| `paths` | no | YAML list of globs (e.g. `["src/**/*.{ts,tsx}"]`). Omit for an always-on rule (loads at launch like `CLAUDE.md`). |
| `obey` | — | conventions to follow (≥1 of `obey`/`avoid` required) |
| `avoid` | — | patterns to ban (rendered as a "NEVER" list) |

**v1 → v2 migration:** a v1 profile's flat `rules.obey`/`rules.avoid` upgrades to a
single always-on `files[]` entry named `project-conventions` (no `paths`). Absent
`why`/`findings` are treated as gaps to fill on resume; the next emit writes
`spec_version: 2`.
```

- [ ] **Step 4: Replace the example block**

Replace the existing `## Example` YAML with:
```yaml
meta:    { project: acme-api, generated_by: ymir, generated_at: 2026-06-18, spec_version: 2 }
project: { language: typescript, runtime: bun, layer: backend, host: github }
concerns:
  rules:
    status: captured
    files:
      - name: typescript-conventions      # → .claude/rules/typescript-conventions.md
        paths: ["src/**/*.{ts,tsx}"]       # omit `paths` for an always-on rule
        obey: [functional-core-imperative-shell, explicit-return-types]
        avoid: [any, default-exports]
      - name: testing
        paths: ["**/*.test.ts"]
        obey: [arrange-act-assert]
    why: "encode the conventions Claude keeps violating, scoped so they load only when relevant"
    findings: "present-weak — conventions implied in code but undocumented; no .claude/rules/"
    alternatives_considered: [single-CLAUDE.md-section, docs/rules.md]
  lint:
    status: captured
    tool: biome
    strict: true
    style: { indent: tab, quotes: single }
    why: "catch real bugs + kill mixed quote styles without config overhead"
    findings: "missing — no linter config; src/ mixes single+double quotes"
    alternatives_considered: [eslint+prettier]
  ci:        { status: captured, provider: github-actions, runs: [lint], why: "block PRs that fail lint", findings: "missing — no workflows" }
  wiki:      { status: captured, enabled: true, collection: acme-api-wiki, why: "shared project knowledge for Claude", findings: "missing" }
  claude_md: { status: captured, steer: [point-to-wiki, lint-before-commit], why: "steer Claude to wiki + lint gate", findings: "present-weak — thin CLAUDE.md" }
```

- [ ] **Step 5: Run the verification check (expect PASS)**

Run:
```bash
rg -n "spec_version.*2|files\[\]|alternatives_considered|present-weak" plugins/ymir/templates/harness-profile.schema.md
```
Expected: matches in the table, migration note, and example.

- [ ] **Step 6: Commit**

```bash
git add plugins/ymir/templates/harness-profile.schema.md
git commit -m "feat(ymir): harness-profile schema v2 (why/findings/alternatives + rules.files[])"
```

---

### Task 2: Interview engine reference doc — `references/socratic-interview.md`

**Files:**
- Create: `plugins/ymir/references/socratic-interview.md`

**Interfaces:**
- Produces (consumed by Task 4): the named flow `Step 1` points to — the 4-move loop, the per-concern probe bank, the greenfield fallback, the cross-concern consistency checklist (Step 2b), and the anti-patterns.

- [ ] **Step 1: Verify the file does not yet exist (expect FAIL)**

Run: `test -f plugins/ymir/references/socratic-interview.md && echo EXISTS || echo MISSING`
Expected: `MISSING`

- [ ] **Step 2: Create the reference doc with this exact content**

Create `plugins/ymir/references/socratic-interview.md`:
````markdown
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
````

- [ ] **Step 3: Run the verification check (expect PASS)**

Run:
```bash
test -f plugins/ymir/references/socratic-interview.md && \
rg -c "4 moves|per-concern loop|Cross-concern consistency|Greenfield fallback|Anti-patterns" plugins/ymir/references/socratic-interview.md
```
Expected: file exists; count ≥ 5.

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/references/socratic-interview.md
git commit -m "feat(ymir): add Socratic interview engine reference doc"
```

---

### Task 3: Playbook templates — Why/Findings block + rules → `.claude/rules/` + claude_md fix

**Files:**
- Modify: `plugins/ymir/templates/playbook/header.md`
- Modify: `plugins/ymir/templates/playbook/rules.md`
- Modify: `plugins/ymir/templates/playbook/lint.md`
- Modify: `plugins/ymir/templates/playbook/ci.md`
- Modify: `plugins/ymir/templates/playbook/wiki.md`
- Modify: `plugins/ymir/templates/playbook/claude_md.md`

**Interfaces:**
- Consumes: `rules.files[]`, per-concern `why`/`findings`/`alternatives_considered` (Task 1).
- Produces (consumed by Task 4 / `ymir apply`): each section starts with a `**Why / Findings:**` bullet; `rules.md` `**Target:**` is the `.claude/rules/` directory.

- [ ] **Step 1: Verify the change is absent (expect FAIL)**

Run: `rg -l "Why / Findings" plugins/ymir/templates/playbook/`
Expected: no matches (exit 1).

- [ ] **Step 2: Add a one-line note to `header.md`**

Append to `plugins/ymir/templates/playbook/header.md`:
```markdown
>
> Each section opens with a **Why / Findings** line recording the rationale and
> what the codebase scan saw — context for the engineer/LLM; not an action.
```

- [ ] **Step 3: Rewrite `rules.md` to target `.claude/rules/`**

Replace the entire contents of `plugins/ymir/templates/playbook/rules.md` with:
```markdown
## rules → `.claude/rules/` (native path-scoped rules)

- **Why / Findings:** {{RULES_WHY}} — repo scan: {{RULES_FINDINGS}}. Considered: {{RULES_ALTERNATIVES}}.
- **Target:** the `.claude/rules/` directory (one `<name>.md` file per `concerns.rules.files[]` entry)
- **Inputs:** `concerns.rules.files[]` (each `{name, paths?, obey[], avoid[]}`)
- **Steps:**
  1. For each entry in `concerns.rules.files[]`, create `.claude/rules/<name>.md`.
  2. If the entry has `paths`, add YAML frontmatter `--- \npaths:\n  - "<glob>"\n--- `
     listing each glob; if it has no `paths`, write no frontmatter (always-on rule).
  3. Add a top **"NEVER"** list — one bullet per `avoid[]` item.
  4. Add sections (Naming, Error handling, Module boundaries) phrased from the
     `obey[]` items.
- **Verify:** every `files[]` entry has a matching `.claude/rules/<name>.md`; each
  scoped entry's frontmatter `paths` matches the profile; every `avoid[]` item
  appears in its file's NEVER list.
```

- [ ] **Step 4: Add the Why/Findings bullet to `lint.md`, `ci.md`, `wiki.md`, `claude_md.md`**

In `lint.md`, insert as the first bullet (before `**Target:**`):
```markdown
- **Why / Findings:** {{LINT_WHY}} — repo scan: {{LINT_FINDINGS}}. Considered: {{LINT_ALTERNATIVES}}.
```
In `ci.md`, insert as the first bullet:
```markdown
- **Why / Findings:** {{CI_WHY}} — repo scan: {{CI_FINDINGS}}. Considered: {{CI_ALTERNATIVES}}.
```
In `claude_md.md`, insert as the first bullet (before `**Target:**`):
```markdown
- **Why / Findings:** {{CLAUDE_MD_WHY}} — repo scan: {{CLAUDE_MD_FINDINGS}}. Considered: {{CLAUDE_MD_ALTERNATIVES}}.
```
In `wiki.md`, insert directly under the `## wiki / context …` heading (before the `- **Target:**` line):
```markdown
- **Why / Findings:** {{WIKI_WHY}} — repo scan: {{WIKI_FINDINGS}}.
```

- [ ] **Step 5: Fix `claude_md.md` so it no longer points at rules**

In `plugins/ymir/templates/playbook/claude_md.md` Step 2, replace the directive
line so it drops `point-to-rules` and notes auto-loading:
```markdown
  2. For each `steer[]` point, add a short directive — e.g. `point-to-wiki`
     links `wiki/SCHEMA.md`; `lint-before-commit` tells Claude to run the lint
     command before commits. Do NOT add a pointer to `.claude/rules/` — Claude
     Code auto-discovers those; a `point-to-rules` steer is redundant.
```

- [ ] **Step 6: Run the verification check (expect PASS)**

Run:
```bash
rg -c "Why / Findings" plugins/ymir/templates/playbook/*.md   # expect 5 files
rg -n "\.claude/rules/" plugins/ymir/templates/playbook/rules.md
rg -n "point-to-rules" plugins/ymir/templates/playbook/claude_md.md   # expect: only the "Do NOT" line
```
Expected: `Why / Findings` in all 5 concern templates; `rules.md` targets `.claude/rules/`; `claude_md.md` only mentions `point-to-rules` in the prohibition.

- [ ] **Step 7: Commit**

```bash
git add plugins/ymir/templates/playbook/
git commit -m "feat(ymir): playbook Why/Findings blocks + rules targets .claude/rules/"
```

---

### Task 4: Rewrite the interview half of `SKILL.md` (Steps 0–5)

**Files:**
- Modify: `plugins/ymir/SKILL.md` (the checklist + Steps 1–4 region, currently lines ~65–137; and the `line 81` premise)

**Interfaces:**
- Consumes: the reference doc (Task 2), schema v2 (Task 1), playbook templates (Task 3).
- Produces: the user-facing flow. Leaves the `## Applying the spec` and `## Reverting an apply` sections (and `## Boundaries`) intact, except the one boundary wording about rules.

- [ ] **Step 1: Verify the new flow is absent (expect FAIL)**

Run: `rg -n "Understand the project|socratic-interview.md|Spec-review gate" plugins/ymir/SKILL.md`
Expected: no matches (exit 1).

- [ ] **Step 2: Replace the codebase premise (current `line 81`)**

In the `## Step 1 …` region, replace:
```markdown
The user does not hand-write code, so Ymir cannot infer the stack from files.
```
with:
```markdown
Ymir explores the codebase FIRST (Step 0) and grounds every question in what it
found. Only when the repo has no usable signals does it fall back to asking cold.
```

- [ ] **Step 3: Replace Steps 1–4 with the new Steps 0–5**

Replace the whole region from `## Step 1 — Checklist-driven interview (socratic)` through the end of `## Step 4 — Offer to apply (the full flow is init → apply)` with:

````markdown
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
````

- [ ] **Step 4: Update the checklist intro + "How this skill works" references**

In the `## The checklist` section, leave the table as-is (the five concerns are
fixed). In the `## How this skill works` table row for `ymir init`, change its
description to: `understand the codebase, sweep the checklist, audit, emit the spec`.

In `## Boundaries`, replace the rules-related wording so it reflects
`.claude/rules/`:
```markdown
- The `rules` concern emits native `.claude/rules/*.md` (path-scoped), not a
  `docs/rules.md`; `CLAUDE.md` does not point at them (auto-discovered).
```

- [ ] **Step 5: Run the verification check (expect PASS)**

Run:
```bash
rg -n "Step 0 — Understand the project|socratic-interview.md|Spec-review gate|spec_version: 2" plugins/ymir/SKILL.md
rg -n "cannot infer the stack from files" plugins/ymir/SKILL.md   # expect: no matches
```
Expected: the new steps + reference pointer present; the old premise gone.

- [ ] **Step 6: Cross-file consistency check**

Run:
```bash
# every concern named in SKILL.md Step 0 has a playbook template
for c in rules lint ci wiki claude_md; do test -f plugins/ymir/templates/playbook/$c.md || echo "MISSING $c"; done
# the reference doc the skill points to exists
test -f plugins/ymir/references/socratic-interview.md && echo OK
```
Expected: no `MISSING`; `OK`.

- [ ] **Step 7: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "feat(ymir): codebase-first Socratic interview (Steps 0-5, consistency + gates)"
```

---

### Task 5: Reframe docs — `README.md` + `plugin.json`

**Files:**
- Modify: `README.md`
- Modify: `plugins/ymir/.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: the final behaviour from Tasks 1–4. No downstream consumers.

- [ ] **Step 1: Verify the reframe is absent (expect FAIL)**

Run: `rg -n "codebase-first|\.claude/rules" README.md plugins/ymir/.claude-plugin/plugin.json`
Expected: no matches (exit 1).

- [ ] **Step 2: Update `plugin.json` description**

Set the `description` field to:
```json
  "description": "Explores THIS project's codebase first, then runs a deep Socratic interview across a harness checklist (rules → .claude/rules/, lint, CI lint, wiki/context, CLAUDE.md), captures the rationale, re-audits for consistency, and emits a spec under .ymir/. 'ymir apply' then generates the harness (with backups + 'ymir revert'). Never writes application code.",
```

- [ ] **Step 3: Update the README Status/overview**

In `README.md`, update the overview/status prose to state: ymir now (1) understands
the codebase before interviewing, (2) interviews deeply per concern (why →
recommend → confirm), capturing `why`/`findings`, and (3) emits `rules` as native
`.claude/rules/*.md`. Keep it to 2-3 sentences; match the existing README voice.

- [ ] **Step 4: Run the verification check (expect PASS)**

Run: `rg -n "codebase|Socratic|\.claude/rules" README.md plugins/ymir/.claude-plugin/plugin.json`
Expected: matches in both files.

- [ ] **Step 5: Commit**

```bash
git add README.md plugins/ymir/.claude-plugin/plugin.json
git commit -m "docs(ymir): reframe as codebase-first deep-interview harness generator"
```

---

### Task 6: Final consistency sweep + manual dry-run protocol

**Files:**
- None modified (verification only). Optionally Create: a throwaway fixture under `$TMPDIR`.

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Automated cross-file consistency sweep**

Run:
```bash
# spec_version 2 is consistent across schema + SKILL
rg -n "spec_version" plugins/ymir/templates/harness-profile.schema.md plugins/ymir/SKILL.md
# no stray docs/rules.md as a TARGET anywhere (only allowed as an "alternative considered")
rg -n "Target:.*docs/rules.md" plugins/ymir/templates/playbook/ || echo "OK: no docs/rules.md target"
# SKILL points to the reference doc and it exists
rg -q "references/socratic-interview.md" plugins/ymir/SKILL.md && test -f plugins/ymir/references/socratic-interview.md && echo "OK: reference wired"
```
Expected: `spec_version: 2` in both; `OK: no docs/rules.md target`; `OK: reference wired`.

- [ ] **Step 2: Manual dry-run — existing repo (present-weak)**

In a scratch dir with a `package.json` (TS) and a loose `eslint` config, mentally
walk `ymir init`: Step 0 must report `lint: present-weak`; Move 2 must *recommend
keep/tune eslint* (not propose biome blind); the emitted profile must contain
`lint.why` and `lint.findings`. Record PASS/FAIL in the commit message of any
follow-up fix.

- [ ] **Step 3: Manual dry-run — greenfield**

In an empty dir, walk `ymir init`: every concern `missing`; the engine asks cold
using the fallback phrasing; `findings` reads `"missing — greenfield"`.

- [ ] **Step 4: Manual dry-run — rules scope + consistency**

Walk the `rules` concern with one always-on group and one `paths`-scoped group:
the profile must produce two `files[]` entries; only the scoped one has `paths`.
Then seed a conflict (a rule that needs enforcement biome lacks) and confirm Step 2b
flags it and loops back.

- [ ] **Step 5: Record results**

If any dry-run reveals a gap, fix it inline in the relevant task's files and
re-commit. If all pass, no commit needed — note completion to the user.

---

## Self-Review

- **Spec coverage:** Step 0 codebase-first (Task 4 Step 3) ✓; per-concern engine (Tasks 2, 4) ✓; capture why/findings/alternatives (Tasks 1, 3, 4) ✓; consistency + go-back + reflection gate + spec-review gate (Tasks 2, 4) ✓; `rules` → `.claude/rules/` (Tasks 1, 3) ✓; lean SKILL + reference doc (Tasks 2, 4) ✓; schema v2 + migration (Task 1) ✓; docs reframe (Task 5) ✓; apply directory-Target accommodation (noted in Task 3 rules.md Target + Open items — execution surfaces it during dry-run Task 6 Step 4).
- **Placeholder scan:** the `{{...}}` tokens are intentional playbook template syntax; no `TBD`/`TODO`/"implement later" remain.
- **Type consistency:** `files[]` entry shape `{name, paths?, obey, avoid}` is identical across Task 1 (schema), Task 3 (`rules.md` Steps), and Task 4 (Step 1 instructions). `why`/`findings`/`alternatives_considered` names match across all tasks.
- **Note:** `ymir apply`'s `**Target:**` parser accepting a directory for `.claude/rules/` is an Open Item from the spec — if Task 6 Step 4 shows apply mishandling the directory target, add a follow-up task to extend the parser (kept out of scope here per the spec's "apply unchanged except minimal accommodation").
