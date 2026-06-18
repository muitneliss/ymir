# Wiki Auto-Sync: provenance + staleness detection — Design

Date: 2026-06-17
Status: Approved (design); implementation pending
Branch: `feat/wiki-auto-sync`

## Problem

The Ymir wiki is an LLM-maintained knowledge base whose `sources/` pages
summarize downstream files (the consumer's code/docs). When those downstream
files change, nothing tells the wiki it is now out of date — a source page keeps
describing a stale version of the file, and the qmd search index keeps serving
stale chunks. There is no mechanism to detect drift or to drive the wiki back
into agreement with what the user actually has.

## Goal

When a tracked downstream file changes, the wiki detects the drift, surfaces it
to Claude at session start, and Claude re-ingests the affected page so the
summary matches the current file. The search index refreshes automatically on
every wiki write.

Content regeneration (the summary text) is **agent-driven** — the LLM rewrites
the summary. The deterministic, fully-automatic parts are: drift detection,
session-start surfacing, and qmd index refresh.

## Non-Goals (YAGNI)

- No fully-unattended re-summarization (no background LLM / API key).
- No live PostToolUse watching of every file edit. Detection is at session start
  and on-demand via `wiki status`.
- No transitive auto-rewrite of notes — notes that depend on a stale source are
  flagged for review, not rewritten automatically.
- No git dependency. Drift is detected by content hash, not git diff.
- `validate` keeps its current structural scope; freshness lives in `status`.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| What triggers sync | Any downstream file a source page was ingested from |
| Autonomy | Agent-driven: detect + surface → Claude re-ingests |
| Provenance store | Real file path + sha256, in source-page frontmatter |
| Change detection | Content sha256 (not mtime, not git) |
| Surfacing | SessionStart hook runs `wiki status` + on-demand `wiki status` |
| Index refresh | Auto `qmd collection add` (best-effort) on every wiki write |

## Architecture

Four units, each independently testable:

1. **Provenance in frontmatter** (`schema.ts`, `pages.ts`, `commands/ingest.ts`)
   — source pages record where they came from and the file's hash at ingest.
2. **`wiki status`** (`src/status.ts`, `commands/status.ts`) — pure drift
   computation over the wiki + project files.
3. **SessionStart hook** (`hooks/wiki-sync-status.mjs`, `hooks/hooks.json`) —
   runs `wiki status` and injects a re-ingest instruction into the session.
4. **qmd reindex** (`src/reindex.ts`, `commands/reindex.ts`) — best-effort
   `qmd collection add`, called by write commands.

Project root is `resolve(wikiRoot, "..")` (the wiki lives at `<project>/wiki`).
All `source_path` values are stored relative to that project root.

### Unit 1 — Provenance in frontmatter

Source-page frontmatter gains two **optional** fields (added alongside the
existing `source` field — no breaking rename, so existing pages stay valid):

- `source_path` — path to the downstream file, relative to project root
  (e.g. `src/auth.ts`, `README.md`).
- `source_hash` — sha256 hex of that file's bytes at ingest time.

`ingest` gains `--source <path>` (alias of the existing `--raw`). The CLI
resolves `<path>` from the current working directory, reads the file, computes
its sha256, relativizes the path to project root, and stores `source_path` +
`source_hash`. It also keeps writing the legacy `source` field (= the path as
given) so older tooling/readers still work. The summary body still comes from
stdin.

Schema rules (zod) — all three optional, with a refine that at least one of
`source` / `source_path` is present:
- `source`: optional string (legacy; still written for back-compat).
- `source_path`: optional string (relative to project root).
- `source_hash`: optional string. Pages without it are treated as **untracked**
  (older pages, or pages whose file no longer needs watching) and are skipped by
  drift detection — never reported as stale. This keeps every existing
  `sources/` page valid after the schema change.

Notes are unchanged: they carry no path and synthesize sources.

### Unit 2 — `wiki status`

Pure function `computeStatus(root): StatusReport` plus a thin command wrapper.

For each page in `sources/`:
- no `source_hash` → `untracked`
- `source_path` does not exist under project root → `missing`
- sha256(file) !== `source_hash` → `stale`
- else → `current`

For each page in `notes/`: if it `[[links]]` a source whose status is `stale`
or `missing`, mark it `review` (reuses the link graph already built by
`validate`).

`StatusReport = { stale: Page[]; missing: Page[]; untracked: Page[];
current: Page[]; review: Note[] }` where `Page` carries `{ title, rel,
source_path }`.

Command `wiki status`:
- Default: human-readable grouped report.
- `--json`: emit `StatusReport` as JSON.
- Exit code: `1` if any `stale` or `missing`; otherwise `0`. (`untracked` and
  `review` do not fail the exit code.)

### Unit 3 — SessionStart hook `wiki-sync-status.mjs`

A plugin-level SessionStart hook (registered in `plugins/ymir/hooks/hooks.json`
alongside `ensure-wiki-binary`). Behavior:

- If `./wiki` does not exist, or the `wiki` binary is absent, or qmd is not
  needed here → silent `exit 0`.
- Run `wiki --root ./wiki status --json`.
- If `stale` or `missing` is non-empty, write a concise instruction block to
  **stdout** (SessionStart stdout is injected into the session context), e.g.:

  ```
  [ymir] Wiki out of date. Re-ingest these to match current files:
    - page "Auth Module"  ← src/auth.ts (changed)
    - page "Readme"       ← README.md (missing)
  For each: read the file, then run
    wiki --root ./wiki ingest --source <path> --title "<page title>"
  ```

- Always `exit 0` — never block the session.
- Errors (binary missing, status crash) are swallowed to stderr; never fatal.

### Unit 4 — qmd reindex

`reindex(root, { runner }): Promise<ReindexResult>` spawns
`qmd collection add ./wiki --name <collectionName>` where
`collectionName = "<basename(projectRoot)>-wiki"` (matches the `SCHEMA.md`
setup line). Injectable `runner` (same pattern as `query.ts`) so tests never
spawn qmd.

- qmd missing / non-zero exit → return `{ ok: false, skipped: true }`, print a
  one-line warning, do **not** throw.
- Command `wiki reindex` exposes it directly.
- `ingest`, `note`, and `index` call `reindex` best-effort after a successful
  write. A `--no-reindex` flag skips it (used by tests and CI).

## Data flow

1. **Ingest:** `wiki ingest --source src/auth.ts --title "Auth Module"` →
   CLI hashes `src/auth.ts`, writes the source page with `source_path` +
   `source_hash`, rebuilds index + log, best-effort reindex.
2. **Drift:** user edits `src/auth.ts`. Hash now differs from `source_hash`.
3. **Detect + surface:** next session → SessionStart hook runs `wiki status`,
   sees `Auth Module` is `stale`, injects the re-ingest instruction.
4. **Re-sync:** Claude reads `src/auth.ts`, writes a fresh summary, runs
   `wiki ingest --source src/auth.ts --title "Auth Module"` → page + hash
   updated, index refreshed.
5. On-demand at any time: `wiki status` to see drift; `wiki reindex` to refresh
   search.

## Error handling

- `status`: a missing source file is a reported state (`missing`), not a crash.
- `reindex`: qmd absence/failure is non-fatal and never blocks a wiki write.
- SessionStart hook: every failure path is swallowed → `exit 0`, never blocks.
- `ingest --source <path>`: if the path does not exist at ingest time → hard
  error (nonzero exit), since you cannot summarize a file that is not there.

## Testing (bun)

- **schema:** `source_path` required; `source_hash` optional; round-trip parse.
- **status:** temp wiki + temp project files exercising `current`, `stale`,
  `missing`, `untracked`, and note `review`; `--json` shape; exit codes.
- **reindex:** injectable runner asserts `qmd collection add ./wiki --name
  <name>` args; runner-throws path returns `skipped` without throwing.
- **ingest:** `--source` stores correct relative path + hash from a temp file;
  re-ingest after the file changes updates `source_hash`; missing path errors.
- **hook:** `wiki status --json` with stale input → stdout contains the
  instruction block; clean wiki → empty stdout, exit 0.

## Files

- **Edit** `plugins/ymir/wiki-cli/src/schema.ts` — `source_path` / `source_hash`.
- **Edit** `plugins/ymir/wiki-cli/src/pages.ts` — render provenance fields.
- **Edit** `plugins/ymir/wiki-cli/src/commands/ingest.ts` — `--source`, hashing.
- **New** `plugins/ymir/wiki-cli/src/status.ts` — `computeStatus`.
- **New** `plugins/ymir/wiki-cli/src/commands/status.ts` — `wiki status`.
- **New** `plugins/ymir/wiki-cli/src/reindex.ts` — best-effort qmd reindex.
- **New** `plugins/ymir/wiki-cli/src/commands/reindex.ts` — `wiki reindex`.
- **Edit** `plugins/ymir/wiki-cli/src/commands/note.ts`,
  `src/cli.ts` (index cmd) — best-effort reindex + `--no-reindex`.
- **Edit** `plugins/ymir/wiki-cli/src/cli.ts` — wire `status`, `reindex`.
- **New** `plugins/ymir/hooks/wiki-sync-status.mjs` — SessionStart hook.
- **Edit** `plugins/ymir/hooks/hooks.json` — register the hook.
- **Edit** `plugins/ymir/wiki-cli/src/templates/wiki/SCHEMA.md` — document the
  `--source` provenance + `status` / `reindex` workflow.
- **New** tests under `plugins/ymir/wiki-cli/test/` per the Testing section.
