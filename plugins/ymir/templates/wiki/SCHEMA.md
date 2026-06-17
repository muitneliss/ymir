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
- `ingest --raw <raw/path> --title <t>` (body on STDIN) — summarize a source.
- `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
- `index` — rebuild the catalog.
- `validate` — health check (frontmatter, `[[links]]`, orphans).
- `query <q>` — search via qmd.

## Page conventions
- Cross-reference pages with `[[Exact Title]]`. The CLI validates every link target exists.
- Frontmatter is injected by the CLI — do not write it yourself.

## Operations
- **Ingest:** user drops a file in `raw/` → you read it, discuss takeaways → call
  `ingest` with the extracted body → then update related `notes` via `note`.
- **Query:** call `query` → read returned pages → answer with citations →
  optionally file the answer back as a `note`.
- **Lint:** run `validate` → fix reported issues by issuing further CLI commands.

## Search (qmd) setup
One-time, on this machine:

```
qmd collection add ./wiki --name PROJECT_NAME-wiki
qmd embed
```

Then `wiki query "..."` (which shells out to `qmd query --json --files`).
Optional tighter integration: add a `qmd` MCP server (`qmd mcp`) to your client.
