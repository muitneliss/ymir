## wiki / context → LLM-maintained wiki

- **Inputs:** `concerns.wiki.enabled` (run only when `true`), `concerns.wiki.collection`, `meta.project`
- **Target:** the `wiki/` tree + `.claude/hooks/block-wiki-edits.mjs`

This lays down an LLM-maintained wiki backed by the Ymir wiki CLI. Do all of the
following with tools (Bash/Write), in order — this is the existing wiki flow,
unchanged:

1. **Create the tree** under the project root:
   - `wiki/raw/`, `wiki/sources/`, `wiki/notes/` — each with a `.gitkeep`
     (copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/gitkeep`).
   - `wiki/SCHEMA.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/SCHEMA.md`,
     then replace the literal `PROJECT_NAME` with the current directory's base
     name (`meta.project`).
   - `wiki/index.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/index.seed.md`.
   - `wiki/log.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/log.seed.md`.
2. **Install the hook**:
   - Copy `${CLAUDE_PLUGIN_ROOT}/templates/hooks/block-wiki-edits.mjs` to
     `.claude/hooks/block-wiki-edits.mjs`.
   - Merge `${CLAUDE_PLUGIN_ROOT}/templates/hooks/settings.snippet.json` into `.claude/settings.json`.
     If `.claude/settings.json` exists, deep-merge the `hooks.PreToolUse` array
     (append the matcher entry; do not clobber existing hooks). If it does not
     exist, create it from the snippet.
3. **Point CLAUDE.md at the wiki**: append (creating the file if absent) a block:

   ```markdown
   ## Wiki / Context
   This project has an LLM-maintained wiki under `wiki/`. You MUST NOT hand-edit
   wiki docs (`wiki/sources`, `wiki/notes`, `index.md`, `log.md`) — they are
   managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
   `wiki/SCHEMA.md` for the rules and command reference.
   ```
4. **Verify**: run
   `${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki validate`
   and confirm it prints `wiki valid`. If it errors, stop and report.
5. **Tell the user** the qmd one-time setup (from `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki && qmd embed`.
