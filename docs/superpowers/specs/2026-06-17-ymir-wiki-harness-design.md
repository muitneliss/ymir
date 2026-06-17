# Ymir Wiki Harness + Wiki CLI — Design

Date: 2026-06-17
Status: Approved (design); implementation pending
Branch: `feat/ymir-wiki-harness`

## Background

The "LLM Wiki" pattern: instead of query-time RAG over raw documents, an LLM
incrementally builds and maintains a persistent, interlinked markdown knowledge
base. Three layers:

1. **Raw sources** — immutable source documents the LLM reads but never edits.
2. **The wiki** — LLM-generated markdown (summaries, entity/concept pages,
   index, log). The LLM owns this layer.
3. **The schema** — a document telling the LLM how the wiki is structured and
   what workflows to follow (ingest / query / lint).

Ymir already lists "wiki / context" as harness concern #4 (see
`plugins/ymir/SKILL.md`). This design implements that concern: Ymir becomes the
**generator** that scaffolds an LLM-maintained wiki skeleton into a target
project, plus the tooling and enforcement that keep the wiki deterministic.

## Goals

- Ymir scaffolds a generic, domain-agnostic wiki skeleton into the current
  project (cwd).
- The LLM **never hand-writes or hand-edits** wiki documents. All wiki writes go
  through a CLI that owns structure (filename, frontmatter, placement,
  cross-link validation, formatting) and updates index + log atomically.
- The CLI **formats then validates** every write; invalid input is rejected so
  the LLM must fix it → deterministic, schema-conformant docs.
- A hard mechanism (PreToolUse hook) prevents the LLM from bypassing the CLI via
  direct file edits.
- Search/read uses `qmd` (local hybrid BM25 + vector + LLM-rerank markdown
  search).

## Non-Goals (YAGNI)

- No domain tailoring (personal / research / book / business presets). One
  generic skeleton only.
- Ymir does not implement ingest/query/lint logic itself. That logic lives in
  the scaffolded `SCHEMA.md` (workflows) + the CLI (mechanics).
- No application/business code generation (existing Ymir boundary).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Where the pattern lives | Ymir "wiki / context" harness piece (Ymir = generator) |
| Tailoring | Generic skeleton, no domain presets |
| Schema home | Dedicated `wiki/SCHEMA.md` + short pointer from project `CLAUDE.md` |
| Search tooling | `qmd` integration (read side) |
| Wiki write tooling | Dedicated CLI; LLM must use it, never hand-write |
| CLI language | TypeScript / Node |
| CLI distribution | Bundled in the Ymir plugin, invoked via `${CLAUDE_PLUGIN_ROOT}` |
| Hand-write prevention | PreToolUse hook that blocks `Write`/`Edit`/`MultiEdit` on wiki content paths |
| CLI help | `commander` auto-help + a `help` command for LLM clarity |

## Architecture

Two sides:

- **Write + validate side** = the Wiki CLI (bundled in plugin).
- **Read + search side** = `qmd` (configured against `wiki/`).

Enforcement is two-layer: the PreToolUse hook blocks direct edits live; the CLI
guarantees format + validation on the sanctioned write path.

### Component 1 — Wiki CLI (`plugins/ymir/wiki-cli/`)

TypeScript/Node, shipped in the plugin and committed as a bundled
`dist/cli.js`. Invoked as:

```
node ${CLAUDE_PLUGIN_ROOT}/wiki-cli/dist/cli.js <cmd> --root <project>/wiki [...]
```

(`--root` defaults to `./wiki` relative to cwd.)

Toolchain: built and tested with **bun** (`bun build` for the self-contained
bundle, `bun test` for the suite). No `tsup`/`vitest`/`esbuild` dev chain.

Dependencies:

- `commander` — CLI parsing + auto-generated help.
- `js-yaml` (4.2.0+, parsed with `JSON_SCHEMA`) — frontmatter read/write via a
  small internal `frontmatter.ts` (replaces `gray-matter` to drop its
  vulnerable bundled js-yaml and avoid YAML date coercion / merge-key DoS).
- `remark` (+ `remark-frontmatter`, `remark-gfm`) — markdown parse + format.
- `zod` — frontmatter schema validation per page type.

Commands:

| Command | Job |
|---|---|
| `ingest --raw <path> --title <t> [--body -]` | Read body from stdin/flag → wrap in source-page template, inject validated frontmatter, write `wiki/sources/<slug>.md`, rebuild `index.md`, append `log.md`. |
| `note --type entity\|concept\|topic --name <n> [--body -]` | Create/update a note page in `wiki/notes/<slug>.md` with validated frontmatter; rebuild index; append log. |
| `index` | Rebuild `index.md` from all pages (LLM never edits index by hand). |
| `log <op> <title>` | Append a `## [YYYY-MM-DD] <op> \| <title>` entry to `log.md`. |
| `validate` | Check frontmatter schema, broken `[[wikilinks]]`, orphan pages, stale markers, and format. Exit nonzero on failure. |
| `fmt` | Normalize markdown via remark. |
| `query <q>` | Wrap a `qmd` search over `wiki/` (read side). |
| `help` | Print command list, examples, page types, and frontmatter contract for the LLM. |

Behavior: every **write** command internally runs `fmt` then `validate` before
committing the file. On validation failure: no write, nonzero exit, actionable
error message so the LLM corrects its input.

Page-type frontmatter contract (enforced by zod):

- Common: `title`, `type`, `date`, `tags[]`.
- Source page: + `source` (raw path), `ingested` date.
- Note page (entity/concept/topic): + `source_count`.

(`tags`/`date`/`source_count` enable Obsidian Dataview.)

### Component 2 — Scaffolded wiki (into target project cwd)

```
<project>/
├── wiki/
│   ├── raw/        # immutable sources, user drops files here (.gitkeep)
│   ├── sources/    # CLI-written source summaries
│   ├── notes/      # CLI-written entity/concept/topic pages
│   ├── index.md    # CLI-rebuilt catalog
│   ├── log.md      # CLI-appended timeline
│   └── SCHEMA.md   # rules: MUST use CLI; command reference; page conventions; qmd usage
├── <qmd config>    # qmd indexes wiki/ (exact filename pinned from qmd README at build)
├── .claude/
│   ├── settings.json          # PreToolUse hook entry (merged, not clobbered)
│   └── hooks/
│       └── block-wiki-edits.mjs
└── CLAUDE.md       # pointer block → wiki/SCHEMA.md ("wiki edits ONLY via wiki-cli")
```

`SCHEMA.md` is the enforcement contract in prose: ingest/query/lint workflows
expressed as CLI invocations, page conventions, and qmd usage. It is the only
wiki file the LLM may read as instructions (and may hand-edit — it is rules, not
content).

### Component 3 — PreToolUse hook (hand-write prevention)

Scaffolded **into the target project** (not the plugin) so protection persists
even if Ymir is uninstalled and so project-relative paths resolve reliably.

- `.claude/settings.json`: a PreToolUse hook with matcher `Write|Edit|MultiEdit`
  calling `.claude/hooks/block-wiki-edits.mjs`. Merge into existing settings if
  present; never clobber.
- `block-wiki-edits.mjs`: reads `tool_input.file_path`; if the path is under
  `wiki/sources/`, `wiki/notes/`, `wiki/index.md`, or `wiki/log.md` → **deny**
  with message: *"Wiki docs are CLI-managed. Use wiki-cli (ingest/note/index/log),
  not direct edits."*
- **Allow**: `wiki/raw/**` (user-owned sources) and `wiki/SCHEMA.md` (rules).

Exact deny mechanism (exit code vs JSON `permissionDecision: "deny"`) pinned
from the Claude Code hook docs at build.

### Component 4 — qmd integration (read side)

Scaffold writes a qmd config targeting `wiki/`, and a `SCHEMA.md` section with:
install, index command, query examples, and the optional MCP-server route.
Exact config filename/syntax pinned from the qmd README at build time.

## Ymir code changes

- **New** `plugins/ymir/wiki-cli/` — TS source, `package.json`, bundled
  `dist/cli.js`.
- **New** `plugins/ymir/templates/wiki/` — `SCHEMA.md`, `index.md` seed,
  `log.md` seed, `.gitkeep`s, qmd config template.
- **New** `plugins/ymir/templates/hooks/` — `block-wiki-edits.mjs` +
  `settings.json` snippet.
- **Edit** `plugins/ymir/SKILL.md` — implement the `wiki/context` branch of
  Step 2: create dirs, copy templates, render project name, install hook +
  settings (merge), append CLAUDE.md pointer, run `wiki validate` to confirm a
  healthy scaffold. Keep boundary: Ymir scaffolds `SCHEMA.md`; thereafter
  `SCHEMA.md` + CLI drive ingest/query/lint, not the Ymir dispatcher.
- **Edit** `README.md` / `plugin.json` — note the wiki piece + CLI are
  implemented.

## Data flow

- **Ingest:** user drops file in `wiki/raw/` → asks LLM to ingest → LLM reads
  raw, discusses, calls `wiki ingest` with extracted body → CLI writes source
  page (formatted + validated), rebuilds index, appends log → LLM updates
  related notes via `wiki note`.
- **Query:** LLM calls `wiki query` (qmd) → reads returned pages → synthesizes
  answer with citations → optionally files the answer back via `wiki note`.
- **Lint:** LLM runs `wiki validate` → fixes reported contradictions/orphans/
  stale/broken-links by issuing further CLI commands.

## Error handling

- CLI write commands are atomic-ish: format + validate before write; on failure,
  abort with nonzero exit and a clear message; no partial files.
- `validate` is the single source of truth for "is the wiki healthy"; SKILL.md
  runs it post-scaffold.
- Hook denies direct edits with a message pointing at the CLI.

## Testing

- CLI unit/integration tests (`bun test`) for: each command happy path,
  frontmatter validation rejection, broken-link detection, index rebuild, log
  append format, `fmt` idempotence.
- Scaffold smoke test: run the SKILL flow against a temp dir, assert the tree +
  a passing `wiki validate`.
- Hook test: simulate a `Write` to `wiki/notes/x.md` → expect deny; to
  `wiki/raw/x.md` → expect allow.

## Open items pinned to build time

- qmd config filename/syntax (from qmd README).
- Claude Code PreToolUse deny mechanism exact shape (from hook docs).
- CLI bundling approach (`bun build --target node --format esm` → single self-contained `dist/cli.js`).
