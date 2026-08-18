---
title: Playbook Wiki
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/wiki.md
source_path: plugins/ymir/templates/playbook/wiki.md
source_hash: 5b58433103b94f96eda6d43a5b8e08b269010228637fc718d6369547d03514bd
ingested: 2026-08-18
---

# Playbook Wiki

## wiki / context → LLM-maintained wiki

* **Why / Findings:** {{WIKI\_WHY}} — repo scan: {{WIKI\_FINDINGS}}.
* **Target:** the `wiki/` tree + `.claude/hooks/block-wiki-edits.mjs`
* **Inputs:** `concerns.wiki.enabled` (run only when `true`), `concerns.wiki.collection`, `meta.project`

This lays down an LLM-maintained wiki backed by the Ymir wiki CLI. The wiki
harness is scaffolded by **a single CLI call** — never by hand-editing files. The
CLI owns the tree, the PreToolUse hook, the `.claude/settings.json` entry, the
`CLAUDE.md` block, and the validation step.

1. **Scaffold + verify** — provision the wiki binary (idempotent), then from the
   project root run:

   ```bash
   node "$SKILL_ROOT/hooks/ensure-wiki-binary.mjs"
   "$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki init
   ```

   `$SKILL_ROOT` is the Ymir skill's root directory (contains `SKILL.md`).
   It is idempotent (safe to re-run). On success the last line is `wiki valid`.
   If it errors, stop and report.

2. **Tell the user** the qmd one-time setup (also in `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki`. Search is keyword-only
   (BM25) — no `qmd embed`; re-run `qmd collection add` to refresh after adding
   pages.

* **Verify:** `"$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki validate`
  prints `wiki valid`.
