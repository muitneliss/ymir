# Ymir Socratic Interview — Design

Date: 2026-06-18
Status: Approved (design); implementation pending
Branch: `worktree-feat+ymir-harness-spec`

## Background

Ymir's `SKILL.md` Step 1 is labelled "Checklist-driven interview (socratic)"
(`SKILL.md:79`), but it is structurally a **form-fill**, not a dialogue. It walks
a fixed six-item checklist (item 0 techstack, then concerns 1–5) and, for each,
asks the schema's required fields ("which lint tool?", "which CI provider?").
The re-audit gate (`SKILL.md:93–105`) loops back only on **field presence**, not
on the quality, depth, or internal consistency of the answers.

Two concrete problems follow:

1. **The interview is shallow.** "Socratic" here means only *one decision at a
   time*; it never probes *why* the user wants a choice, never recommends with
   trade-offs, and never adapts the next question to the last answer. The user's
   own words: it "feels like just overall questions."
2. **It refuses to read the codebase.** `SKILL.md:81` asserts: *"The user does
   not hand-write code, so Ymir cannot infer the stack from files."* This
   contradicts the intended flow — *understand the codebase → propose the harness
   the project needs → apply it.*

This design transplants the **confirmed** behaviours of the Superpowers
`brainstorming` skill's interview engine into ymir, while preserving ymir's
identity: spec-only output, the fixed five-concern checklist, `AskUserQuestion`,
and the untouched `apply`/`revert` machinery.

Confirmed brainstorming behaviours we adopt (verified against
`skills/brainstorming/SKILL.md`, not just the research deep-dive):

- One question per message; the agent yields the floor after each
  (`SKILL.md:72,135`).
- Explore project context **before** asking anything (`SKILL.md:24,67`).
- Anchor questions to *purpose / constraints / success criteria*
  (`SKILL.md:73`).
- Propose 2–3 approaches with trade-offs, **lead with a recommendation and
  explain why** (`SKILL.md:77–79`).
- Be flexible — **go back and clarify when something doesn't make sense**
  (`SKILL.md:140`).
- A human review gate on the written artefact before the next phase
  (`SKILL.md:122–126`).

Deliberately **not** treated as gospel (these are research interpretation, not
in the source): a named six-step loop, an internal "bucket-tracking" mechanism,
a generic "contradiction detector." Where we add consistency checking we make it
a *bounded, enumerated* checklist, not open-ended magic.

## Goals

- **Codebase-first.** Ymir explores the repo before interviewing and produces a
  per-concern gap report. Greenfield repos fall back to today's ask-cold
  behaviour.
- **Keep all five concerns**, but make each one a deep, grounded exchange instead
  of a single field-question.
- **Per-concern engine:** probe *why* → recommend (grounded, 2–3 trade-offs,
  recommendation first) → adaptive follow-up only when needed → confirm.
- **Capture the rationale durably** — `why`, `findings`, `alternatives_considered`
  per concern — in `harness-profile.yaml` (v2) and `harness-playbook.md`.
- **Add structural discipline:** a bounded cross-concern consistency pass with
  go-back, a reflection gate before emitting, and a spec-review gate before
  `apply`.
- **Keep `SKILL.md` lean** by moving the detailed engine into a bundled
  reference doc (mirrors how `brainstorming` uses `visual-companion.md`).

## Non-Goals (YAGNI)

- No change to `ymir apply` / `ymir revert` mechanics, or the wiki CLI / hook /
  templates.
- No new automated test framework. Verification is a schema self-check plus
  documented dry-run scenarios.
- No dropping, adding, or reordering concerns — the five stay fixed.
- The skill stays **spec-only** (the wiki-only intent exception is unchanged).
- No generic contradiction detector; cross-concern consistency is an explicit,
  finite checklist of known couplings.
- No domain presets / per-stack tailoring beyond what the codebase scan reveals.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Target scenario | **Both** — read the codebase if present, else greenfield fallback. Understanding the codebase happens **before** the interview. |
| Codebase → checklist | Keep the **fixed 5 concerns**; run **gap-analysis per concern** and propose a deeper, grounded fix (not "which tool?"). |
| Per-concern depth | **Probe why → recommend (2–3 trade-offs, recommendation first) → adaptive follow-up → confirm** (~2–4 turns, adaptive). |
| Capture rationale | **Fully structured** — `why` / `findings` / `alternatives_considered` per concern in YAML **and** playbook. Bump `spec_version` to 2. |
| Structural fidelity | **Full set** — cross-concern consistency + go-back, a reflection gate, and a spec-review gate. |
| Edit structure | **Lean `SKILL.md` + a new `references/socratic-interview.md`** reference doc holding the engine detail. |

## Architecture

The interview half of ymir grows from three steps to six. Only the **interview**
side changes; `apply`/`revert` (`SKILL.md:139–211`) are untouched. New or changed
steps are marked ▶.

```
▶ Step 0  Understand the project (codebase-first)
            scan repo → per-concern gap report: present-strong / present-weak / missing
            greenfield fallback: no signals → all "missing", ask cold (today's behaviour)
            present a short findings summary before the first question

▶ Step 1  Per-concern Socratic interview   (item 0 techstack, then the 5 concerns)
            for each concern, run the 4-move engine (detailed in the reference doc):
              probe why → recommend → adaptive follow-up → confirm
            write decision + why + findings + alternatives_considered to the profile as you go
            techstack (item 0): mostly CONFIRM what was detected, not ask cold

▶ Step 2  Consistency + re-audit gate
            (a) required-field check (today's behaviour)
            (b) NEW bounded cross-concern consistency pass → on conflict, surface + go back
            (c) NEW reflection gate: per-concern "decision + one-line why", "revisit anything?"

  Step 3  Emit the spec    (harness-profile.yaml v2 + harness-playbook.md with Why/Findings)

▶ Step 4  Spec-review gate    NEW: "Spec written to .ymir/. Review before I generate?" → wait
  Step 5  Offer apply         (today's apply/revert flow — unchanged)
```

### File layout (Approach A)

| File | Change |
|---|---|
| `plugins/ymir/SKILL.md` | Rewrite Steps 0–4 into the codebase-first Socratic flow; **lean** — step structure + pointers, not full mechanics. Replace `line 81` ("cannot infer from files") with the codebase-first premise. |
| `plugins/ymir/references/socratic-interview.md` | **NEW.** The engine: the 4-move per-concern loop, a per-concern probe bank, the recommendation pattern, the cross-concern consistency checklist, the greenfield fallback, and an explicit anti-pattern callout. |
| `plugins/ymir/templates/harness-profile.schema.md` | Schema **v2**: add `why` / `findings` / `alternatives_considered` per concern; bump `spec_version`. |
| `plugins/ymir/templates/playbook/header.md` + each `*.md` | Add a non-breaking `**Why / Findings:**` block per concern section. |
| `README.md`, `plugins/ymir/.claude-plugin/plugin.json` | Light reframe: codebase-first + deeper interview. Still spec-only. |

### Component 1 — Step 0: understand the project (codebase-first)

Before any question, ymir scans the repo and forms a **gap report**. It detects:

- **Foundation (item 0):** language(s), runtime, layer (frontend/backend/both),
  repo host — from manifests (`package.json`, `go.mod`, `pyproject.toml`, …),
  lockfiles, and the `.git` remote.
- **Per concern, current state + quality verdict:**
  - `rules`: existing conventions docs, `.editorconfig`, an existing `CLAUDE.md`/`AGENT.md` rules section.
  - `lint`: a linter config present? which tool? strict?
  - `ci`: workflows present? what do they run? provider inferred from host.
  - `wiki`: any docs/context/wiki directory already used for project knowledge?
  - `claude_md`: `CLAUDE.md`/`AGENT.md` present? what does it currently steer?

Each concern gets a verdict: **`present-strong`** (exists and is healthy),
**`present-weak`** (exists but thin/loose/outdated), or **`missing`**.

**Greenfield fallback.** If the repo has no usable signals (empty or near-empty),
every concern is `missing` and ymir proceeds to ask cold — this preserves the
original onboarding behaviour as a special case rather than the default.

Ymir presents a brief findings summary (one line per concern) before the first
question, so the user sees what ymir found and the interview is visibly grounded.

### Component 2 — Step 1: the per-concern Socratic engine

Detailed in `references/socratic-interview.md`; `SKILL.md` Step 1 points to it.
For each concern, in checklist order, ymir runs four moves. **Each move that asks
the user is its own single-question `AskUserQuestion` message** (one question at a
time — the linchpin).

- **Move 1 — Probe the *why* (open, grounded in the finding).** Not "which
  linter?" but, e.g.: *"I see no linter config and mixed quote styles across
  `src/` — what are you mainly after: catch real bugs, enforce consistent style,
  or both?"* The finding makes the question concrete and shows ymir read the
  repo.
- **Move 2 — Recommend with trade-offs, recommendation first.** Grounded in the
  stack + finding + the stated *why*, ymir proposes 2–3 options, leads with its
  pick and the reasoning, and invites challenge: *"For a TS/bun backend I'd pick
  **biome** — one fast tool for lint+format, near-zero config; trade-off vs
  eslint is fewer niche plugins. Alternative: eslint+prettier if you need
  specific plugins. I'd go biome — sound?"*
- **Move 3 — Adaptive follow-up, only when needed.** Ask a follow-up **only** if
  the answer reveals a gap, a surprise, or a contradiction (e.g. the user wants
  strict enforcement but the codebase has patterns that would break under it).
  Otherwise skip straight to confirm. This is the friction ceiling that keeps the
  exchange a dialogue, not an interrogation.
- **Move 4 — Confirm + record.** Write `decision` + `why` + `findings` +
  `alternatives_considered` into `.ymir/harness-profile.yaml`, then advance.

Item 0 (techstack) runs first and is mostly **confirmation** of what Step 0
detected ("Detected TypeScript on bun, backend, GitHub — correct?") rather than a
cold question.

`references/socratic-interview.md` additionally specifies:

- A **per-concern probe bank**: the grounded *why*-question and the recommendation
  skeleton for each of `rules`/`lint`/`ci`/`wiki`/`claude_md`.
- The **greenfield fallback** phrasing (no finding to cite → ask the purpose
  directly).
- An explicit **anti-pattern** callout: *"DON'T just ask 'which tool?' — that bare
  field-question is the shallow failure this engine exists to remove."*

### Component 3 — Step 2: consistency + re-audit gate

Runs after the per-concern sweep, in three parts:

- **(a) Required-field check** — unchanged from today: every in-scope concern must
  have its machine-decision fields (`lint.tool`, `ci.provider`+`runs`, etc.) plus,
  now, `why` and `findings`. Anything missing keeps the concern `pending` and
  loops back to ask exactly that.
- **(b) Cross-concern consistency pass (NEW, bounded).** A finite, enumerated
  checklist of known couplings — not a general reasoner:
  - `lint.tool` ↔ `rules`: do `obey`/`avoid` rules need enforcement the chosen
    tool cannot provide? (e.g. an architectural rule biome cannot lint → flag that
    it belongs in the rules doc / `CLAUDE.md`, not expected from lint).
  - `ci.provider` ↔ `project.host`: does the provider match the repo host
    (github → github-actions)?
  - `lint.strict` ↔ `project.layer`/`runtime`: is the strictness sensible for the
    declared stack?
  - `claude_md.steer` ↔ concerns 1–4: does it point at the rules/wiki/lint that
    were actually set up?
  On a conflict, ymir surfaces it plainly and **goes back** to re-ask the specific
  concern (the "be flexible" mechanism).
- **(c) Reflection gate (NEW).** Replaces the bare coverage table. Print, per
  concern, `decision + one-line why`, then ask: *"Does this reflect your intent?
  Want to revisit any concern before I write the spec?"* Step 3 runs only after
  the user confirms. The `✅/⏭️/❌` status markers are retained inside this summary.

### Component 4 — Step 3: emit the spec (schema v2)

`harness-profile.yaml` gains per-concern rationale. `meta.spec_version` becomes
`2`. Required-when-`captured` fields now include `why` and `findings`;
`alternatives_considered` is recommended. Example:

```yaml
meta:    { project: acme-api, generated_by: ymir, generated_at: 2026-06-18, spec_version: 2 }
project: { language: typescript, runtime: bun, layer: backend, host: github }
concerns:
  lint:
    status: captured
    tool: biome
    strict: true
    style: { indent: tab, quotes: single }
    why: "catch real bugs + kill mixed quote styles without config overhead"
    findings: "missing — no linter config; src/ mixes single+double quotes"
    alternatives_considered: [eslint+prettier]
```

`harness-playbook.md` per-concern sections gain a `**Why / Findings:**` block
directly under the heading, filled from the profile via the existing `{{...}}`
placeholder mechanism:

```markdown
## lint → linter config

- **Why / Findings:** {{LINT_WHY}} — repo scan: {{LINT_FINDINGS}}. Considered: {{LINT_ALTERNATIVES}}.
- **Target:** ...
- **Inputs:** ...
- **Steps:** ...
- **Verify:** ...
```

`ymir apply` reads a section's `**Target:**` and `**Verify:**` lines and executes
its `**Steps:**`. The new `**Why / Findings:**` bullet is none of those, so apply
treats it as inert prose — the block is **non-breaking**.

### Component 5 — Step 4: spec-review gate (NEW)

After emitting, before offering `apply`, ymir tells the user the spec files are
written and asks them to review:

> "Spec written to `.ymir/harness-profile.yaml` and `.ymir/harness-playbook.md`.
> Please review them and tell me if you want any changes before I generate the
> harness."

Wait for the response. On a change request, revisit the relevant concern, re-emit,
and return to this gate. Only on approval proceed to Step 5 (offer apply). Step 5
and the entire `apply`/`revert` flow are unchanged.

## Data flow

- **`ymir init`:** Step 0 scans → gap report → Step 1 sweeps the 5 concerns,
  writing `decision`+`why`+`findings`+`alternatives` per concern into
  `harness-profile.yaml` → Step 2 required-field check + consistency pass +
  reflection gate → Step 3 assembles `harness-playbook.md` from the per-concern
  templates → Step 4 spec-review gate → Step 5 offers `apply`.
- **Narrow action (`ymir add lint`):** Step 0 scans only what's needed → confirm
  item 0 if unknown → run the engine for `lint` only → consistency pass touching
  `lint`'s couplings → reflection gate for `lint` → update the `lint:` block and
  the `## lint` playbook section → offer `ymir apply lint`.
- **Resume (existing `.ymir/`):** read the profile; treat any concern lacking
  `why`/`findings` as needing depth on resume; ask only what's missing or
  requested. Idempotent and resumable.
- **Wiki-only intent (`ymir add context`/`add wiki`):** unchanged — executes the
  wiki playbook template directly against the project.

## Error handling

- **"I don't know yet" for a decision** → concern stays `status: pending`; the
  audit blocks emission until resolved or explicitly `skipped`.
- **Greenfield repo / no signals** → all concerns `missing`; the engine asks cold
  using the fallback phrasing; `findings` records `"missing — greenfield"`.
- **Cross-concern conflict** → surfaced at Step 2(b); ymir loops back to re-ask the
  implicated concern rather than emitting a spec with a silent contradiction.
- **v1 profile from a prior run** → loads fine; ymir treats absent
  `why`/`findings` as gaps to fill on resume and writes `spec_version: 2` on the
  next emit. No destructive migration.
- **User skips a concern** → `status: skipped` + reason; shown as `⏭️` in the
  reflection summary; omitted from the playbook.

## Testing

ymir's skill behaviour is prose, so verification is lightweight and explicit:

1. **Schema self-check** at the end of Step 3: validate `harness-profile.yaml`
   against the v2 contract — including `why`/`findings` present for every
   `captured` concern. Inline check; no new tooling (honours YAGNI).
2. **Dry-run scenarios** (run manually during implementation, documented in the
   plan):
   - Existing repo with `eslint` already present → ymir detects it, Move 2
     recommends keep/tune, `findings: present-weak`, `why` captured.
   - Greenfield empty repo → fallback path, asks cold, `findings: missing`.
   - Seeded cross-concern conflict (a rule needing a plugin biome lacks) → the
     consistency pass flags it and loops back.
3. **Backward-compat check:** a v1 profile loads, resumes, and upgrades to v2 on
   next emit without data loss.
4. **Apply non-regression:** `ymir apply` against a v2 spec still parses
   `Target`/`Verify` correctly and ignores the `Why / Findings` block.

## Boundaries (unchanged, and stronger)

- Operate on the current project only (`cwd`).
- **Spec only**, except the wiki-only intent (`ymir add context`/`add wiki`),
  which executes the wiki scaffold directly — unchanged.
- The interview is the source of truth; prefer asking over assuming — but now
  *ground* the asking in what the codebase actually shows.
- The five concerns are fixed; ymir deepens each, it does not drop or invent
  concerns.

## Open items pinned to build time

- Exact detection heuristics per language/tool for Step 0 (finalize in the plan;
  start with the common stacks already named in `templates/playbook/lint.md`).
- Whether `findings` is a single prose string or a small structured object
  (`{state, detail}`) — default to a prose string for YAGNI; revisit if the
  consistency pass needs structured access.
- The precise enumerated entries of the cross-concern consistency checklist
  (finalize in the plan; the four couplings above are the seed set).
