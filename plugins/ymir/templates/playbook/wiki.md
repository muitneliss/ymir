## wiki / context → LLM-maintained wiki

- **Target:** the `wiki/` tree + `.claude/hooks/block-wiki-edits.mjs`
- **Inputs:** `concerns.wiki.enabled` (run only when `true`), `concerns.wiki.collection`, `meta.project`

This lays down an LLM-maintained wiki backed by the Ymir wiki CLI. The wiki
harness is scaffolded by **a single CLI call** — never by hand-editing files. The
CLI owns the tree, the PreToolUse hook, the `.claude/settings.json` entry, the
`CLAUDE.md` block, and the validation step.

1. **Scaffold + verify** — from the project root, run:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki" --root ./wiki init
   ```

   It is idempotent (safe to re-run). On success the last line is `wiki valid`.
   If it errors, stop and report.

2. **Tell the user** the qmd one-time setup (also in `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki`. Search is keyword-only
   (BM25) — no `qmd embed`; re-run `qmd collection add` to refresh after adding
   pages.

- **Verify:** `"${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki" --root ./wiki validate`
  prints `wiki valid`.
