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
{{WIKI_BIN}} --root ./wiki <command>
```

Run `... help` for the full command reference. Key commands:
- `ingest --source <path> --title <t>` (body on STDIN) — summarize a tracked file.
  Records `source_path` + `source_hash` for drift detection.
  Use `--raw <label>` (legacy) when ingesting from a non-tracked input.
- `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
- `index` — rebuild the catalog.
- `check [--json] [--error-on-orphan-notes] [--error-on-untracked-sources]` — single CI gate.
  Evaluates schema validity, page identity, broken links, orphan policy, provenance drift,
  untracked sources, declarative coverage, and index freshness in one read-only pass.
  Exits non-zero on any hard failure; zero only when the wiki satisfies policy.
  Orphan notes and untracked sources are warnings by default; promote to errors with the
  respective flags. Use `--json` for machine-readable output with stable schema
  `{ ok, errors[], warnings[] }`, each finding carrying `kind`, `message`, and `remedy`.
- `validate` — health check (frontmatter, `[[links]]`, orphans, slug collisions, filename/title mismatches, nested pages).
- `status` — show drift between source pages and their tracked files.
  Use `--json` for machine-readable output (exit 1 if stale/missing).
- `coverage` — verify declarative source coverage defined in `wiki/tracked.yaml`.
  Fails when an in-scope file has no source page, an exclusion is stale, a file is
  excluded yet ingested, a source page is out of scope, or multiple pages claim the
  same file. Use `--json` for machine-readable output (exit 1 on any violation).
- `remove --title <t> [--preview]` — atomically delete a page and rebuild all generated state.
  Refuses if any page holds an inbound `[[link]]` to the target — fix those first.
  `--preview` reports what would be removed and lists inbound links without writing.
- `rename --old-title <t> --new-title <t> [--preview]` — rename a page, rewrite all inbound
  `[[links]]`, and rebuild generated state atomically. Fails on slug collision.
  `--preview` reports the plan (link count, affected paths) without writing.
- `reindex` — refresh the search index (creates the collection, or `qmd update`s it).
- `query <q> [--limit <n>] [--chunks] [--verbatim] [--full|--snippet] [--context <chars>]` — search this wiki via qmd.

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
- **CI gate:** run `check` (or `check --json`) → exits non-zero on any hard failure.
  Add `--error-on-orphan-notes` or `--error-on-untracked-sources` to promote warnings to errors.
- **Lint:** run `validate` → fix reported issues by issuing further CLI commands.
- **Drift check:** run `status` → re-ingest stale pages with updated summaries.
- **Coverage check:** run `coverage` → follow each violation's remedy to ingest missing files
  or update `wiki/tracked.yaml`.
- **Remove a page:** run `remove --title <t> --preview` to see inbound links and confirm no
  breakage, then run `remove --title <t>` to delete the page and rebuild the index.
  If inbound links exist, update or remove them first, then retry.
- **Rename a page:** run `rename --old-title <t> --new-title <t> --preview` to see the scope
  of link rewrites, then run `rename --old-title <t> --new-title <t>` to apply atomically.
  All `[[old title]]` links in sources and notes are rewritten to `[[new title]]` in one step.

## Source coverage (`wiki/tracked.yaml`)

Create `wiki/tracked.yaml` to declare which project files the wiki must cover:

```yaml
include:
  - "src/**/*.ts"
  - "docs/**/*.md"
exclude:
  - pattern: "src/generated/**"
    reason: "Auto-generated — not authored documentation"
```

- `include` — glob patterns relative to the project root. Every matching file that
  is not excluded must have an ingested source page.
- `exclude` — patterns with a mandatory `reason`. Each exclusion must match at least
  one file (stale exclusions fail the check). A file that is excluded must not have
  a source page.

Run `wiki coverage` to verify. Each violation includes an actionable remedy.
File discovery uses `git ls-files` so untracked scratch files in a worktree do not
create false failures.

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
Indexing is automatic: every `ingest`, `note`, and `index` calls `reindex`,
which registers the collection on first use and `qmd update`s it thereafter. No
manual setup step is needed; run `wiki reindex` yourself only to force a refresh.

`wiki query "..."` shells out to `qmd search --json -c PROJECT_NAME-wiki`. The
`-c` scope matters: without it qmd searches *every* collection registered on the
machine, not just this project's wiki. Only `sources/` and `notes/` are indexed —
`raw/` is deliberately excluded, since the raw originals outrank the curated
summaries written from them. Use `--limit <n>` to cap results and `--chunks` to
get every matching chunk rather than one entry per file.

Search is keyword-only (BM25) — lightweight, no embeddings and no local LLM, so
there is no `qmd embed` step. Because BM25 matches words rather than meaning,
`query` first reduces your text to its content words: `"When did Melanie paint a
sunrise?"` is searched as `melanie paint sunrise`. Asking a full question
verbatim retrieves far worse (measured on a 19-page wiki: 0 hits vs 1, and 3
hits vs 10). Pass `--verbatim` when you need the text exactly as typed.

Each hit returns the passage around the match — whole paragraphs, bounded by the
enclosing section — not a narrow window, so you can answer from the result
without opening the file. A page smaller than the budget (`--context`, default
3000 chars) comes back whole; longer pages are narrowed to the matching section.
`--full` forces the entire page, `--snippet` gives qmd's raw window. Measured on
this project's own wiki, answering from raw windows scored 43% where answering
from expanded passages scored 93%.

`ingest`, `note`, and `index` automatically call
`wiki reindex` (best-effort) after each write; pass `--no-reindex` to skip.
Run `wiki reindex` manually if the index is stale. Optional tighter integration:
add a `qmd` MCP server (`qmd mcp`) to your client.
