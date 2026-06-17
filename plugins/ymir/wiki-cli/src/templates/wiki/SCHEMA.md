# Wiki Schema & Rules

This wiki is an LLM-maintained knowledge base. **You (the LLM) never hand-write
or hand-edit wiki documents.** All writes go through the Ymir wiki CLI, which
formats and validates every change. Direct edits to `sources/`, `notes/`,
`index.md`, and `log.md` are blocked by a PreToolUse hook.

## Layers
- `raw/` — immutable sources. You may read these; never edit them. The user adds files here.
- `sources/` — one CLI-written summary page per ingested source.
- `notes/` — CLI-written entity / concept / topic pages (the synthesis).
- `index.md` — CLI-rebuilt catalog. Never edit by hand.
- `log.md` — CLI-appended timeline. Never edit by hand.

## The CLI
Invoke via the bundled binary:

```
${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki <command>
```

Run `... help` for the full command reference. Key commands:
- `ingest --source <path> --title <t>` (body on STDIN) — summarize a tracked file.
  Records `source_path` + `source_hash` for drift detection.
  Use `--raw <label>` (legacy) when ingesting from a non-tracked input.
- `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
- `index` — rebuild the catalog.
- `validate` — health check (frontmatter, `[[links]]`, orphans).
- `status` — show drift between source pages and their tracked files.
  Use `--json` for machine-readable output (exit 1 if stale/missing).
- `reindex` — re-run `qmd collection add` to refresh the search index.
- `query <q>` — search via qmd.

## Page conventions
- Cross-reference pages with `[[Exact Title]]`. The CLI validates every link target exists.
- Frontmatter is injected by the CLI — do not write it yourself.

## Operations
- **Ingest (tracked):** read the source file → call `ingest --source <path> --title <t>`
  with the summary on STDIN → then update related `notes` via `note`.
  The CLI records a sha256 hash so drift can be detected later.
- **Ingest (raw):** user drops a file in `raw/` → read it → call
  `ingest --raw <raw/path> --title <t>` (no drift tracking).
- **Query:** call `query` → read returned pages → answer with citations →
  optionally file the answer back as a `note`.
- **Lint:** run `validate` → fix reported issues by issuing further CLI commands.
- **Drift check:** run `status` → re-ingest stale pages with updated summaries.

## Auto-Sync (drift detection)

A SessionStart hook runs `wiki status` at session start. If any source page is
out of date (the tracked file changed since last ingest), it prints:

```
[ymir] Wiki out of date. Re-ingest these to match current files:
  - page "Auth Module"  ← src/auth.ts (changed)
For each: read the file, then run:
  wiki --root ./wiki ingest --source <path> --title "<page title>"
```

Source pages that have no `source_hash` (ingested with `--raw`, or older pages)
are "untracked" and never reported stale. You can ignore them or re-ingest with
`--source` to opt them in to drift detection.

## Search (qmd) setup
One-time, on this machine:

```
qmd collection add ./wiki --name PROJECT_NAME-wiki
```

Then `wiki query "..."` (which shells out to `qmd search --json --files`).
Search is keyword-only (BM25) — lightweight, no embeddings and no local LLM, so
there is no `qmd embed` step. `ingest`, `note`, and `index` automatically call
`wiki reindex` (best-effort) after each write; pass `--no-reindex` to skip.
Run `wiki reindex` manually if the index is stale. Optional tighter integration:
add a `qmd` MCP server (`qmd mcp`) to your client.
