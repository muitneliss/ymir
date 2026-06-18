# Ymir Apply & Revert — Design

Date: 2026-06-17
Status: Approved (design); implementation pending
Branch: `feat/ymir-apply` (stacked on `worktree-feat+ymir-harness-spec` / PR #8)

## Background

After the harness-spec reframe (PR #8), Ymir is a three-step **spec generator**:
interview → re-audit → emit a spec under `.ymir/` (`harness-profile.yaml` +
`harness-playbook.md`). The skill deliberately writes **no** harness files; the
playbook is prose that *drives an LLM* to generate the harness later.

That left a gap users hit immediately: running Ymir on a repo produces two spec
files and nothing else, so "what do I do with this / how do I test it?" has no
in-tool answer. The only path that actually materializes files today is the
narrow wiki-only intent (`ymir add context`), which executes the wiki playbook
section directly.

This design adds the missing **apply step** — and its inverse, **revert** — so a
user can turn the spec into a real, verified harness from inside Ymir. Spec
generation stays spec-only (unchanged); apply is a separate, explicit,
file-writing operation the user triggers.

## Goals

- Add `ymir apply`: read the spec and **execute** each in-scope concern's
  playbook Steps to generate the real harness files, then run each concern's
  **Verify** and report results.
- Make apply **non-destructive by default**: preview a plan, confirm once, and
  back up any file before overwriting/merging it.
- Add `ymir revert`: restore the files a previous apply overwrote, from backups.
- Keep the mechanism **skill-driven** (Approach A): everything lives in
  `SKILL.md`; no new compiled code, no second CLI.
- Support narrow scope (`ymir apply lint`) mirroring the existing `add <concern>`
  affordance.

## Non-Goals (YAGNI)

- No deterministic/templated generation. Generation is LLM-driven via the
  playbook (a non-LLM CLI was explicitly rejected — diverse rules/lint/CI cannot
  be templated cleanly).
- No apply **manifest** (e.g. `.ymir/last-apply.json`). Backups alone are the
  revert source. Consequence: revert restores overwritten files but does not
  auto-remove files apply newly created (see Error handling).
- No mutation of `harness-profile.yaml` on apply (no `applied_at`/`status:
  applied`). The summary table + backups are the record.
- No git automation (apply does not branch/commit for the user). It writes to the
  working tree; the user manages git.
- No second compiled CLI (Approach B was considered and declined for now).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Surface | A new `ymir apply` intent in the existing dispatcher skill |
| Who generates | The LLM (Claude) follows the playbook Steps per concern |
| Existing artifact behavior | **Ask per concern**: keep / merge / overwrite |
| Verification | Run **every** concern's Verify (no fail-fast), then a summary table |
| Safety | **Preview plan + single confirm**; back up overwritten/merged files |
| Backup naming | `<path>.backup.<run-id>`, one shared `run-id` per apply run |
| Revert | A dedicated `ymir revert` intent restores the latest run-id's backups |
| State persistence | **No manifest** — backups are the only revert source |
| Implementation | **Approach A — skill-driven**; no new compiled code |
| Narrow scope | `ymir apply <concern>` applies only that concern |

## Architecture

Two new intents on the Ymir dispatcher. Both are pure `SKILL.md` procedures the
LLM executes with Bash/Write/Read; neither adds code.

```
ymir apply [<concern>]   load spec → preview/scan → confirm once →
                         per concern { generate | keep | merge(+backup) | overwrite(+backup) } →
                         verify all → summary table
ymir revert              find latest run-id backups → restore → clean up backups
```

`apply` **consumes** the spec and never invents one. If `.ymir/harness-profile.yaml`
or `.ymir/harness-playbook.md` is missing, it stops and tells the user to run
`ymir init` first.

### Concern → target artifact mapping

The preview scan needs to know each concern's output path. The source of truth is
the emitted `harness-playbook.md` itself — each section names its target (e.g.
`## rules → docs/rules.md`). Apply reads the target from the playbook section
rather than hard-coding paths, so the mapping stays consistent with whatever the
spec emitted. Typical targets:

| Concern | Target artifact (from playbook) |
|---|---|
| rules | `docs/rules.md` (or the project's conventions doc) |
| lint | the linter config file (`eslint.config.*`, `biome.json`, …) + scripts |
| ci | the CI workflow (`.github/workflows/*.yml`) |
| wiki | `wiki/` tree + `.claude` hook (via the wiki playbook section) |
| claude_md | `CLAUDE.md` / `AGENT.md` |

### Component 1 — `ymir apply`: load + preview

1. Require both `.ymir/` spec files; else stop with a "run `ymir init` first"
   message.
2. Determine in-scope concerns: all `captured` concerns in the profile, or the
   single concern named in `ymir apply <concern>`.
3. For each in-scope concern, read its target from the playbook and test whether
   the artifact already exists. Print a **plan table**:

   | Concern | Target | State | Planned action |
   |---|---|---|---|
   | lint | `eslint.config.mjs` | exists | ask keep/merge/overwrite |
   | wiki | `wiki/` | missing | create |

4. Ask the user to **proceed once** (single confirmation for the whole run).

### Component 2 — `ymir apply`: execute per concern

Assign **one `run-id`** for the entire run: a timestamp `YYYYMMDDHHMMSS` captured
once at the start (so all backups from this run share a suffix and revert can
target them as a group).

For each in-scope concern, in playbook order:

- **Artifact missing** → generate it by following the concern's playbook Steps.
- **Artifact exists** → ask **keep / merge / overwrite**:
  - *keep* → write nothing; mark `⏭️ kept`.
  - *merge* → back up first (`cp <file> <file>.backup.<run-id>`), then fold the
    spec-driven changes into the existing file (LLM judgment, guided by the
    playbook); mark `🔁 merged`.
  - *overwrite* → back up first, then write the freshly generated artifact; mark
    `✅`.

Rule: **any file apply modifies or overwrites is backed up first**; newly created
files are not backed up (revert handles them differently — see Error handling).

### Component 3 — `ymir apply`: verify + report

After all concerns are processed, run **each** concern's Verify step (from the
playbook). **Do not stop on failure.** Collect every result, then print a summary
table:

| Concern | Result |
|---|---|
| rules | ✅ generated + verified |
| lint | ⏭️ kept (existing) |
| ci | 🔁 merged + verified |
| wiki | ❌ verify failed — `wiki validate` did not print "wiki valid" |

End with a one-line pointer: `ymir revert` undoes this run (run-id `<run-id>`).

### Component 4 — `ymir revert`

- Scan the project for `*.backup.*` files and pick the **latest `run-id`** (max
  timestamp suffix).
- For each `<file>.backup.<run-id>`: restore with `mv <file>.backup.<run-id>
  <file>` (overwriting the applied version), then ensure no stray backup remains.
- Report which files were restored.

## Data flow

- **apply (fresh repo):** `ymir apply` → all artifacts missing → plan table shows
  all "create" → confirm → generate each concern → verify all → summary all ✅.
- **apply (existing harness, ai-dict-like):** plan table shows most concerns
  "exists" → per-concern keep/merge/overwrite prompts → overwrites/merges create
  `.backup.<run-id>` → wiki (net-new) generated → verify all → summary mixes
  ✅/⏭️/🔁.
- **narrow:** `ymir apply lint` → scope = `lint` only → same flow for that one
  concern.
- **revert:** `ymir revert` → restore the latest run-id's backups → working tree
  returns to the pre-apply state for overwritten/merged files.

## Error handling

- **Missing spec** → stop; instruct `ymir init` first. Apply never fabricates a
  spec.
- **Verify failure** → recorded as `❌` in the summary with the reason; the run
  still completes every other concern (no fail-fast).
- **Newly created files on revert (known limitation of "no manifest"):** revert
  restores only files that have a `.backup.<run-id>` (i.e. ones apply
  overwrote/merged). Files apply created from scratch have no backup, so revert
  leaves them; they show up plainly in `git status` and the user removes them
  manually or via `git clean`. This is the accepted trade-off of skipping a
  manifest.
- **Backup collision** → the shared per-run `run-id` timestamp makes
  `<file>.backup.<run-id>` unique per run; re-applying produces a new run-id.

## Relationship to the existing wiki-only intent

`ymir add context` / `ymir add wiki` already executes the wiki playbook section
directly. Once `ymir apply` exists, `ymir apply wiki` reaches the same outcome via
the general path. Decision: **keep `add context` as a shortcut** (unchanged) and
let `apply wiki` be the general mechanism — no removal, just document that both
exist and do equivalent work for the wiki concern.

## Ymir code changes

- **Edit `plugins/ymir/SKILL.md`** — add `apply` and `revert` rows to the intent
  table; add an "Apply" section (load → preview → confirm → per-concern
  generate/keep/merge/overwrite + backup → verify-all → summary) and a "Revert"
  section (restore latest run-id backups). Document the `run-id` and
  `<path>.backup.<run-id>` conventions.
- **Edit `README.md` + `plugin.json`** — reflect that Ymir now both emits a spec
  (`init`) and applies it (`apply` / `revert`); update `argument-hint`.
- **Rake the playbook templates** (`templates/playbook/*.md`) — ensure each
  section states its **target artifact path** (so the preview scan can detect
  existence) and a **runnable Verify**. Most already do; tighten any that don't.
- **No new compiled code, no second CLI** (Approach A). Existing `wiki-cli`,
  `templates/wiki/`, `templates/hooks/` are unchanged and reused by the wiki
  concern.

## Testing (acceptance scenarios — skill, no unit harness)

- Fresh repo: `ymir apply` generates every concern and all Verify steps pass.
- Existing-harness repo: apply prompts keep/merge/overwrite; overwrite/merge
  produce `.backup.<run-id>`; kept concerns write nothing.
- A deliberately failing Verify is reported as `❌` while the run still processes
  the remaining concerns.
- `ymir revert` restores exactly the latest run-id's backups and removes them.
- `ymir apply lint` touches only the lint concern.

## Boundaries

- Operate on the current project only (`cwd`).
- Spec generation (`init` and the `add <concern>` interview) stays **spec-only**.
  `apply` is the explicit, user-triggered step that writes harness files;
  `revert` is its inverse. The wiki-only execute shortcut remains.
- The interview/spec is the source of truth for generation; apply follows the
  playbook rather than improvising structure.

## Open items pinned to build time

- Exact phrasing of the per-concern keep/merge/overwrite prompt and the summary
  table glyphs (finalize in the plan).
- Whether `run-id` is a bare timestamp or timestamp + short random suffix if two
  applies could land in the same second (default: bare `YYYYMMDDHHMMSS`; revisit
  only if needed).
- If revert reliability ever matters more than simplicity, revisit Approach B
  (a small tested helper for backup/restore) — explicitly deferred for now.
