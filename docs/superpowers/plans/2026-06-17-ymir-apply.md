# Ymir Apply & Revert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ymir apply` (generate the real harness from the `.ymir/` spec, with backups) and `ymir revert` (restore the last apply's backups) as new intents on the Ymir dispatcher skill.

**Architecture:** Skill-driven only (Approach A) — all behavior lives in `plugins/ymir/SKILL.md` as prose the LLM executes with Bash/Read/Write; no new compiled code and no second CLI. `apply` reads each concern's `**Target:**` line from the emitted `harness-playbook.md`, generates/keeps/merges/overwrites per concern (backing up before any overwrite/merge), runs every concern's `**Verify:**` step, and prints a summary. `revert` restores `*.backup.<run-id>` files from the latest run.

**Tech Stack:** Markdown skill files; bundled per-concern playbook templates under `plugins/ymir/templates/playbook/`; bash (`date`, `cp`, `mv`) for backups/restore. No test framework is added — this is a prose skill, so verification is structural (grep) plus the acceptance-scenario walkthroughs in the design.

## Global Constraints

- Skill-driven only: **no new compiled code, no second CLI** (Approach A).
- Spec generation stays spec-only; `ymir apply` and `ymir revert` are the only file-writing additions (the existing wiki-only `add context` shortcut is unchanged).
- **No manifest.** Backups are the only revert source.
- Backup naming: `<path>.backup.<run-id>`; `run-id` is one shared `YYYYMMDDHHMMSS` timestamp per apply run (`date +%Y%m%d%H%M%S`).
- Verify **every** in-scope concern (no fail-fast), then print a summary table.
- Preview the plan and get a **single** confirmation before writing; back up **before** any overwrite or merge; never back up a freshly created file.
- Operate on the current project only (`cwd`).
- Commits are signed (repo signing is already configured: `user.signingkey` = the hotmail key, `commit.gpgsign=true`). Do **not** add co-author trailers.
- Spec being implemented: `docs/superpowers/specs/2026-06-17-ymir-apply-design.md`.

---

### Task 1: Add a machine-readable `Target` line to each playbook section template

The apply preview scan must learn each concern's output path. Add a `**Target:**` bullet to every per-concern template so apply can read it deterministically. Each Target is a literal path where fixed, or a profile/convention-derived description where it varies by tool/provider.

**Files:**
- Modify: `plugins/ymir/templates/playbook/rules.md`
- Modify: `plugins/ymir/templates/playbook/lint.md`
- Modify: `plugins/ymir/templates/playbook/ci.md`
- Modify: `plugins/ymir/templates/playbook/wiki.md`
- Modify: `plugins/ymir/templates/playbook/claude_md.md`

**Interfaces:**
- Produces: every playbook section begins (right after its `## …` heading) with a `- **Target:** …` bullet. Task 2's apply flow consumes this exact `**Target:**` marker.

- [ ] **Step 1: Add Target to `rules.md`** — insert as the first bullet, immediately under the `## rules → project rules doc` heading and above the `- **Inputs:**` line:

```markdown
- **Target:** `docs/rules.md` (or the project's existing conventions doc)
```

- [ ] **Step 2: Add Target to `lint.md`** — first bullet under `## lint → linter config`:

```markdown
- **Target:** the linter config for `concerns.lint.tool` — use `concerns.lint.config` if the profile sets it, else the tool's conventional file (`eslint` → `eslint.config.{mjs,js,cjs}` / `.eslintrc*`; `biome` → `biome.json` / `biome.jsonc`; `golangci-lint` → `.golangci.{yml,yaml}`; `ruff` → `ruff.toml` / `pyproject.toml`)
```

- [ ] **Step 3: Add Target to `ci.md`** — first bullet under `## CI lint → CI workflow`:

```markdown
- **Target:** the CI workflow for `concerns.ci.provider` — use `concerns.ci.workflow` if the profile sets it, else any file under `.github/workflows/` (GitHub Actions)
```

- [ ] **Step 4: Add Target to `wiki.md`** — insert as a new bullet directly under the `- **Inputs:** …` line (the wiki template leads with Inputs, then prose):

```markdown
- **Target:** the `wiki/` tree + `.claude/hooks/block-wiki-edits.mjs`
```

- [ ] **Step 5: Add Target to `claude_md.md`** — first bullet under `## CLAUDE.md / AGENT.md → steering file`:

```markdown
- **Target:** `CLAUDE.md` (or `AGENT.md`) at the project root
```

- [ ] **Step 6: Verify every template now has a Target**

Run:
```bash
cd plugins/ymir/templates/playbook
grep -L '\*\*Target:\*\*' rules.md lint.md ci.md wiki.md claude_md.md
```
Expected: **no output** (`grep -L` lists files MISSING the pattern; none should match).

- [ ] **Step 7: Commit**

```bash
git add plugins/ymir/templates/playbook/*.md
git commit -m "feat(ymir): add Target line to each playbook section for apply preview"
```

---

### Task 2: Add the `ymir apply` intent and Apply flow to SKILL.md

**Files:**
- Modify: `plugins/ymir/SKILL.md` (intent table near the top; new section after `## Step 3 — Emit the spec`)

**Interfaces:**
- Consumes: the `**Target:**` and `**Verify:**` markers in `harness-playbook.md` (Task 1 / existing templates).
- Produces: the `## Applying the spec — \`ymir apply\`` section and the `apply` intent rows. Task 3 adds the `revert` rows and section beneath these.

- [ ] **Step 1: Add `apply` rows to the intent table.** In `## How this skill works`, the intent table currently ends with the `ymir add context` row and an `anything ambiguous` row. Insert these two rows **immediately before** the `| anything ambiguous |` row:

```markdown
| `ymir apply` | generate the harness from the spec: preview → confirm → per concern (keep/merge/overwrite, backing up first) → verify all → summary; see "Applying the spec" below |
| `ymir apply lint` (or any concern) | apply only that one concern from the spec |
| `ymir revert` | restore the files the most recent `ymir apply` overwrote/merged, from `*.backup.<run-id>`; see "Reverting an apply" below |
```

(The `ymir revert` row is added here too so the table is complete; its section arrives in Task 3.)

- [ ] **Step 2: Add the Apply section.** Insert the following as a new top-level section **immediately after** the end of `## Step 3 — Emit the spec` (after its last line `Never write the harness files themselves; only the two spec files above.`) and **before** `## Boundaries`:

````markdown
## Applying the spec — `ymir apply` (writes the harness)

`ymir apply` is the explicit, user-triggered step that turns the spec into real
harness files. It never invents a spec: if `.ymir/harness-profile.yaml` or
`.ymir/harness-playbook.md` is missing, stop and tell the user to run `ymir init`
first.

**Scope.** `ymir apply` applies every `captured` concern in the profile.
`ymir apply <concern>` (e.g. `ymir apply lint`) applies only that concern.

**1 — Load + preview.** Read the profile and the playbook. For each in-scope
concern, read its `**Target:**` line from the playbook section to learn the
artifact (a literal path like `docs/rules.md`, or a tool/provider-derived one
such as the linter config for `concerns.lint.tool` or a workflow under
`.github/workflows/`). Test whether that artifact already exists and print a plan
table:

| Concern | Target | State | Planned action |
|---|---|---|---|
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
````

- [ ] **Step 3: Verify the Apply section landed and is well-formed**

Run:
```bash
cd plugins/ymir
grep -n 'Applying the spec' SKILL.md
grep -c 'run_id' SKILL.md
grep -n '| `ymir apply` |' SKILL.md
```
Expected: the `Applying the spec` heading is found once; `run_id` appears at least twice; the `ymir apply` intent row is found.

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "feat(ymir): add 'ymir apply' intent + apply flow to skill"
```

---

### Task 3: Add the `ymir revert` flow and update Boundaries in SKILL.md

The `revert` intent rows were already added to the table in Task 2; this task adds the Revert section and updates the Boundaries section to reflect that two intents now write files.

**Files:**
- Modify: `plugins/ymir/SKILL.md` (new Revert section after the Apply section; rewrite the `## Boundaries` section)

**Interfaces:**
- Consumes: the `<file>.backup.<run-id>` convention produced by Task 2's apply flow.

- [ ] **Step 1: Add the Revert section.** Insert **immediately after** the Apply section's last line (`End by telling the user: ... (run-id \`<run_id>\`).`) and **before** `## Boundaries`:

````markdown
## Reverting an apply — `ymir revert`

`ymir revert` restores the files the most recent `ymir apply` overwrote or merged.

1. **Find the latest run-id.** List backups under the project and take the
   greatest `<run-id>` suffix (timestamps sort lexically):
   ```bash
   ls **/*.backup.* 2>/dev/null | sed 's/.*\.backup\.//' | sort -u | tail -1
   ```
2. **Restore each backup of that run-id:** for every `<file>.backup.<run-id>`, run
   `mv "<file>.backup.<run-id>" "<file>"` (overwriting the applied version).
3. **Report** which files were restored.

**Limitation (by design — no manifest):** revert only restores files that have a
`.backup.<run-id>` — i.e. ones apply overwrote or merged. Files apply created from
scratch have no backup; they remain and show up in `git status`. Remove them
manually or with `git clean` for a full undo.
````

- [ ] **Step 2: Rewrite the Boundaries section.** Replace the entire existing `## Boundaries` section. The current text is:

```markdown
## Boundaries

- Operate on the current project only ("this project" = cwd).
- **Spec only, with one exception** — Ymir writes `.ymir/harness-profile.yaml`
  and `.ymir/harness-playbook.md`, nothing else, *except* the wiki-only intent
  (`ymir add context` / `ymir add wiki`), which executes the wiki scaffold
  directly (see "Wiki-only intent" above). Every other intent stays spec-only;
  generation is downstream.
- Prefer asking over assuming; the interview is the source of truth.
```

Replace it with:

```markdown
## Boundaries

- Operate on the current project only ("this project" = cwd).
- **Spec generation is spec-only.** The interview intents (`ymir init`,
  `ymir add <concern>`) write only `.ymir/harness-profile.yaml` and
  `.ymir/harness-playbook.md`. Two intents write harness files on purpose:
  `ymir apply` (generates the harness from the spec, with backups) and
  `ymir revert` (restores those backups). The wiki-only shortcut
  (`ymir add context` / `ymir add wiki`) also executes directly; `ymir apply wiki`
  reaches the same result through the general apply path.
- Prefer asking over assuming; the interview is the source of truth.
```

- [ ] **Step 3: Verify**

Run:
```bash
cd plugins/ymir
grep -n 'Reverting an apply' SKILL.md
grep -n 'Spec generation is spec-only' SKILL.md
grep -c 'Spec only, with one exception' SKILL.md
```
Expected: the Revert heading is found; the new Boundaries bullet is found; the old `Spec only, with one exception` text count is `0` (fully replaced).

- [ ] **Step 4: Commit**

```bash
git add plugins/ymir/SKILL.md
git commit -m "feat(ymir): add 'ymir revert' flow + update boundaries for apply"
```

---

### Task 4: Reframe README.md + plugin.json to surface apply/revert

So users discover that Ymir can now generate (not just spec) the harness.

**Files:**
- Modify: `README.md` (repo root)
- Modify: `plugins/ymir/.claude-plugin/plugin.json`

- [ ] **Step 1: Update the README intro paragraph.** Replace this paragraph:

```markdown
Ymir does **not** generate application code, and it does **not** write the harness
files itself. It interviews you across a checklist of harness concerns, re-audits
to confirm nothing is missing, and emits a spec under `.ymir/`:
```

with:

```markdown
Ymir does **not** generate application code. The interview step writes only a
spec — it interviews you across a checklist of harness concerns, re-audits to
confirm nothing is missing, and emits a spec under `.ymir/`:
```

- [ ] **Step 2: Update the post-spec sentence.** Replace:

```markdown
You then drive generation through a normal Claude Code session, guided by the spec
Ymir produced.
```

with:

```markdown
You then generate the harness with `ymir apply`, which reads the spec and writes
the real files (backing up anything it overwrites); `ymir revert` undoes the last
apply. You can also drive generation by hand in a normal Claude Code session,
guided by the spec.
```

- [ ] **Step 3: Add apply/revert to the examples block.** Replace this block:

````markdown
```
ymir init for this project
ymir add lint for this project
ymir add rules
ymir set up CI
```
````

with:

````markdown
```
ymir init for this project
ymir add lint for this project
ymir add rules
ymir set up CI
ymir apply            # generate the harness from the spec
ymir revert           # undo the last apply
```
````

- [ ] **Step 4: Update the Status paragraph.** Replace the sentence fragment:

```markdown
re-audit gate, and a spec emitted to `.ymir/` (`harness-profile.yaml` +
`harness-playbook.md`). The spec's per-concern playbook sections live in
```

with:

```markdown
re-audit gate, and a spec emitted to `.ymir/` (`harness-profile.yaml` +
`harness-playbook.md`); `ymir apply` then generates the harness from that spec
(with backups + `ymir revert`). The spec's per-concern playbook sections live in
```

- [ ] **Step 5: Update plugin.json description.** Replace the `"description"` value:

```json
  "description": "Interviews the user about THIS project across a harness checklist (rules, lint, CI lint, wiki/context, CLAUDE.md), re-audits for completeness, and emits a spec under .ymir/ that drives an LLM to generate the harness. Writes only the spec — never harness or application code.",
```

with:

```json
  "description": "Interviews the user about THIS project across a harness checklist (rules, lint, CI lint, wiki/context, CLAUDE.md), re-audits, and emits a spec under .ymir/. 'ymir apply' then generates the harness from the spec (with backups + 'ymir revert'). Never writes application code.",
```

- [ ] **Step 6: Verify**

Run:
```bash
grep -n 'ymir apply' README.md
grep -n 'ymir apply' plugins/ymir/.claude-plugin/plugin.json
python3 -c "import json; json.load(open('plugins/ymir/.claude-plugin/plugin.json')); print('plugin.json valid')"
```
Expected: `ymir apply` is found in both files; `plugin.json valid` prints (no JSON syntax error).

- [ ] **Step 7: Commit**

```bash
git add README.md plugins/ymir/.claude-plugin/plugin.json
git commit -m "docs(ymir): surface 'ymir apply'/'ymir revert' in README + plugin.json"
```

---

## Acceptance scenarios (post-implementation walkthrough)

These are the design's acceptance scenarios. After Task 4, walk each one mentally against the SKILL.md text to confirm the prose is unambiguous:

1. **Fresh repo:** `ymir apply` → plan table shows every concern "missing/create" → confirm → each concern generated → all `Verify` pass → summary all ✅.
2. **Existing harness (ai-dict-like):** plan shows concerns "exists" → per-concern keep/merge/overwrite → overwrite/merge create `*.backup.<run_id>` → wiki (net-new) generated → mixed ✅/⏭️/🔁 summary.
3. **Failing Verify:** one concern's Verify fails → run still completes the rest → summary marks that concern ❌ with a reason.
4. **Revert:** `ymir revert` → restores the latest run-id's `.backup.<run_id>` files; brand-new files remain (documented limitation).
5. **Narrow:** `ymir apply lint` → only the lint concern is previewed, applied, and verified.

## Self-review notes

- **Spec coverage:** apply load/preview (Task 2 §1), confirm (§2), run-id (§3), per-concern keep/merge/overwrite + backup (§4), verify-all (§5), summary (§6); revert (Task 3); Target lines for preview (Task 1); wiki reconciliation + boundaries (Task 3); discoverability (Task 4). All design sections map to a task.
- **No placeholders:** every edit shows exact old/new text; verification uses concrete grep commands with expected output.
- **Naming consistency:** `run_id` / `run-id` and `<file>.backup.<run-id>` are used identically across Tasks 2 and 3; the `**Target:**` marker added in Task 1 is the exact string consumed in Task 2 §1.
