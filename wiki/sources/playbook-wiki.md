---
title: Playbook Wiki
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/wiki.md
source_path: plugins/ymir/templates/playbook/wiki.md
source_hash: b78e4ff45e1a5c02308b966cb2e4ae24e2e66a0464ba95df45af3946586ed773
ingested: 2026-08-18
---

# Playbook Wiki

## wiki / context → LLM-maintained wiki

* **Why / Findings:** {{WIKI\_WHY}} — repo scan: {{WIKI\_FINDINGS}}.
* **Inputs:** `concerns.wiki.enabled` (run only when `true`), `concerns.wiki.collection`, `meta.project`, `target_agent.value`

This lays down an LLM-maintained wiki backed by the Ymir wiki CLI. The wiki
harness is scaffolded by **a single CLI call** — never by hand-editing files.

1. **Scaffold** — provision the wiki binary (idempotent), then from the project root run:

   **If `target_agent.value` is `claude-code`:**

   ```bash
   node "$SKILL_ROOT/hooks/ensure-wiki-binary.mjs"
   "$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki init
   ```

   The CLI installs a PreToolUse hook (`block-wiki-edits.mjs`) and merges
   `.claude/settings.json` to enforce "never hand-edit wiki docs" at the agent level.

   **If `target_agent.value` is `any` (non-Claude target):**

   ```bash
   node "$SKILL_ROOT/hooks/ensure-wiki-binary.mjs"
   "$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki init --no-hook
   ```

   No `.claude/` files are written. Add a CI job instead (see step 2).

   `$SKILL_ROOT` is the Ymir skill's root directory (contains `SKILL.md`).
   It is idempotent (safe to re-run). On success the last line is `wiki valid`.
   If it errors, stop and report.

2. **Wiki guard (non-Claude target only)** — when `target_agent.value` is `any`,
   add a CI job that enforces wiki integrity. For GitHub Actions, add to the CI
   workflow a job that runs:
   ```
   wiki check --error-on-untracked-sources
   ```
   This is agent-independent enforcement equivalent to the PreToolUse hook.
   Skip this step entirely for `claude-code` targets (hook handles it).

3. **Tell the user** the qmd one-time setup (also in `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki`. Search is keyword-only
   (BM25) — no `qmd embed`; re-run `qmd collection add` to refresh after adding
   pages.

* **Verify:** `"$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki validate`
  prints `wiki valid`.
