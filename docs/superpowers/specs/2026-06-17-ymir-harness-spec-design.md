# Ymir Harness Spec Generator — Design

Date: 2026-06-17
Status: Approved (design); implementation pending
Branch: `worktree-feat+ymir-harness-spec`

## Background

Ymir is a single dispatcher skill (`/ymir`) that builds a project's **harness
skeleton** — the foundation that steers Claude Code on a repo — and never
application code. The harness has five concerns: ① rules, ② lint, ③ CI lint,
④ wiki/context, ⑤ `CLAUDE.md`/`AGENT.md`.

Today `plugins/ymir/SKILL.md` defines only **two steps** — Step 1 *Know the
stack* (a short socratic interview) and Step 2 *Scaffold* — and only the
**wiki/context** concern is actually implemented (it writes real files via a
bundled CLI + templates + a PreToolUse hook). The other four concerns are
stubbed.

This design **defines the remaining steps** and reframes what the skill
produces. The interview must be **checklist-driven** so it covers every harness
concern, followed by a **re-audit** that confirms nothing is missing. Crucially,
the skill's deliverable is **a spec, not generated files**: Ymir interviews,
audits, and emits a spec that *drives an LLM to generate the harness for this
specific project*. Generation itself is downstream and out of scope for the
skill.

## Goals

- Turn the interview into a **checklist sweep** across one foundation item
  (project/techstack) plus the five harness concerns, so no concern is skipped
  by accident.
- Add a **re-audit gate**: for every in-scope concern, confirm the captured
  information is sufficient to generate from; if not, loop back and ask.
- Emit a **harness spec** as the skill's only output. The spec captures
  decisions *and* tells an LLM, step by step, how to generate each harness piece
  for this project.
- The skill **writes no harness files** (no rules file, lint config, CI
  workflow, `CLAUDE.md`, or wiki) — it writes only the spec.
- Keep the existing wiki tooling (CLI, templates, hook) useful: wiki becomes one
  entry in the spec whose generation steps point at that tooling.

## Non-Goals (YAGNI)

- The skill does not generate harness artifacts. Generation is a separate,
  downstream LLM step that reads the spec.
- No refactor of the existing `wiki-cli`, wiki templates, or the
  `block-wiki-edits` hook. They stay as-is and are referenced by the spec.
- No domain tailoring / presets. One generic spec shape.
- No application/business code generation (existing Ymir boundary).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| What the skill produces | A **spec only** — no harness files written by the skill |
| Purpose of the spec | Drive an LLM to generate the harness for this specific project |
| Spec prescriptiveness | **Step-by-step** generation instructions, not just a record of decisions |
| Spec shape | **Two files** (Approach B): a machine-readable profile + a prose playbook |
| Profile file | `.ymir/harness-profile.yaml` — decisions only, with a per-concern `status` |
| Playbook file | `.ymir/harness-playbook.md` — per-concern generation steps that read the profile |
| Checklist | One foundation item (project/techstack) + the five harness concerns |
| Interview style | Socratic, one decision at a time via `AskUserQuestion` (unchanged ethos) |
| Re-audit | Required-field check per in-scope concern, then a coverage table the user confirms |
| Wiki's place | One entry in the spec; its playbook steps point at the existing CLI/templates/hook |
| Generation | Out of scope for the skill; performed downstream by an LLM reading the spec |

## Architecture

The skill becomes a three-step **spec generator**. It never writes harness
artifacts; it assembles two spec files from (a) the interview answers and (b)
bundled per-concern playbook-section templates.

```
Step 1 — Checklist-driven socratic interview   (cover foundation + 5 concerns)
Step 2 — Re-audit gate                          (required fields present? confirm coverage)
Step 3 — Emit spec                              (.ymir/harness-profile.yaml + .ymir/harness-playbook.md)
```

The previous "Step 2 — Scaffold" (which ran the wiki scaffold inline) is
**removed** from the skill. The detailed wiki procedure currently living in
`SKILL.md` is relocated into a **wiki playbook-section template** so it becomes
part of the emitted spec instead of something the skill executes.

### The checklist

| # | Item | Drives |
|---|---|---|
| 0 | **project / techstack** | language, runtime, layer (frontend / backend / both), repo host → feeds lint + CI |
| 1 | **rules** | conventions to obey / patterns to avoid |
| 2 | **lint** | linter tool, strictness, style |
| 3 | **CI lint** | CI provider, what it runs |
| 4 | **wiki / context** | enabled?, collection name |
| 5 | **CLAUDE.md / AGENT.md** | steering points (largely derived from 1–4) |

### Component 1 — Step 1: checklist-driven interview

- Uses `AskUserQuestion`, **one decision at a time**, multiple-choice when
  possible (keeps the existing socratic ethos).
- Walks the checklist: item 0 (techstack) first, then 1→5. For each concern, ask
  only what is needed to generate it.
- **Scope by intent:** `ymir init` sweeps the whole checklist; a narrow action
  like `ymir add lint` asks only item 0 (if not already known) plus the `lint`
  concern.
- The user may **skip** a concern → recorded as `status: skipped` with a reason.
- Each answer is written immediately into `.ymir/harness-profile.yaml`, so the
  flow is resumable.

### Component 2 — Step 2: re-audit gate

After the interview, for **each in-scope concern**, verify the profile has the
required fields:

- `project`: `language`, `layer` required; `runtime`, `host` recommended.
- `rules`: at least one of `obey` / `avoid`, or an explicit "no special rules".
- `lint`: `tool` chosen (must be explicit, even if derivable from language).
- `ci`: `provider` + `runs`.
- `wiki`: `enabled` decided; if enabled, `collection` present.
- `claude_md`: `steer` points present (may be derived from the other concerns).

Missing required field → loop back and ask exactly that question. When all
in-scope concerns pass, print a **coverage table** (`✅ captured` /
`⏭️ skipped` / `❌ pending`) and ask the user to confirm. Step 3 runs **only**
after the user confirms. This is the "have we clarified the techstack / the
rules to obey or avoid?" gate.

### Component 3 — Step 3: emit the spec (two files)

**`.ymir/harness-profile.yaml`** — decisions only; a `status` per concern is the
field the audit checks:

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

`status` ∈ `captured | skipped | pending`. The audit refuses to emit while any
in-scope concern is `pending`.

**`.ymir/harness-playbook.md`** — one section per in-scope concern, each with
**Inputs (read from profile) · Steps (for the LLM) · Verify**. Example shape:

```markdown
# Harness Generation Playbook — acme-api
Reads decisions from harness-profile.yaml. Steps below are for the LLM that generates the harness.

## rules → docs/rules.md
- Inputs: concerns.rules.obey, concerns.rules.avoid
- Steps: 1) create docs/rules.md  2) sections Naming / Error handling / Boundaries  3) top "NEVER" list from `avoid`
- Verify: file exists; every `avoid` item appears in the NEVER list

## wiki
- Inputs: concerns.wiki.enabled, concerns.wiki.collection, meta.project
- Steps: if enabled → run the Ymir wiki scaffold (templates + CLI + PreToolUse hook, see plugins/ymir/wiki-cli);
         render PROJECT_NAME = meta.project in SCHEMA.md
- Verify: `wiki validate` prints "wiki valid"
```

**Deterministic assembly:** Ymir does not free-form "generate" the playbook. It
ships **per-concern playbook-section templates** under
`plugins/ymir/templates/playbook/` and assembles `harness-playbook.md` by
selecting the sections for in-scope concerns and filling profile-derived inputs.
The **wiki** section template is the relocated wiki procedure that currently
lives in `SKILL.md`.

## Ymir code changes

- **New** `plugins/ymir/templates/playbook/` — one markdown section template per
  concern (`rules.md`, `lint.md`, `ci.md`, `wiki.md`, `claude_md.md`). `wiki.md`
  contains today's `SKILL.md` wiki steps verbatim (now as instructions, not
  executed by the skill).
- **New** profile shape doc / schema reference for `.ymir/harness-profile.yaml`
  (required fields per `status`) — bundled with the templates so the audit and a
  later validator share one source of truth.
- **Edit** `plugins/ymir/SKILL.md` — replace the 2-step body with the 3-step
  flow: checklist interview → re-audit gate → emit spec. Remove the inline wiki
  scaffold; reference the playbook templates instead. State plainly that the
  skill writes only the spec.
- **Edit** `README.md` / `plugin.json` — reframe Ymir as a **harness-spec
  generator**: it interviews, audits, and emits a spec under `.ymir/` that drives
  LLM harness generation.
- **Unchanged** `plugins/ymir/wiki-cli/`, `templates/wiki/`, `templates/hooks/` —
  referenced by the wiki playbook section, not modified.

## Data flow

- **init:** `ymir init` → Step 1 sweeps the checklist, writing answers into
  `harness-profile.yaml` → Step 2 audits required fields, prints coverage table,
  user confirms → Step 3 assembles `harness-playbook.md` from the per-concern
  templates → spec is the deliverable. A downstream LLM later reads the spec to
  generate the harness.
- **narrow action:** `ymir add lint` → read existing `.ymir/` if present → ask
  only item 0 (if unknown) + `lint` → audit `lint` only → update the `lint:`
  block in the profile and the `## lint` section in the playbook.

## Error handling

- "I don't know yet" for a decision → concern stays `status: pending`; the audit
  blocks emission until it is resolved or explicitly changed to `skipped`.
- Existing `.ymir/` from a prior run → read it; ask only what is missing or
  requested. The flow is idempotent and resumable across sessions.
- Skipped concern → `status: skipped` + reason; the coverage table shows `⏭️`.

## Testing

- **Profile schema check:** validate `.ymir/harness-profile.yaml` against the
  required-fields-per-`status` contract. Lightweight self-check at the end of
  Step 3; no new tooling required initially (a small validator can be added
  later if useful).
- **Audit logic:** a profile missing a required field for an in-scope concern is
  reported as `pending` and the spec is not emitted.
- **Playbook assembly:** for a given profile, the emitted playbook contains a
  section for each `captured` concern and none for `skipped` ones, with inputs
  resolved from the profile.

## Boundaries (unchanged, and stronger)

- Operate on the current project only (`cwd`).
- **Spec only** — the skill writes no harness files, including wiki.
- The interview is the source of truth; prefer asking over assuming.

## Open items pinned to build time

- Exact `harness-profile.yaml` field list per concern (finalize during plan).
- Whether the end-of-Step-3 schema check is inline prose validation or a tiny
  bundled validator (decide during plan; default to inline to honor YAGNI).
