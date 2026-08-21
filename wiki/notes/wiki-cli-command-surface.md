---
title: Wiki CLI Command Surface
type: concept
date: 2026-08-21
tags: []
source_count: 0
---

# Wiki CLI Command Surface

The wiki CLI (`wiki-cli/` at the repo root, TypeScript/Node, built and tested with
bun) is invoked as `wiki --root ./wiki <command>` and is the only sanctioned
writer of the wiki. It is built on commander (parsing/help), a small js-yaml
frontmatter module, remark (format), and zod (per-page-type frontmatter schema).

Current commands:

* `ingest --source <path> --title <t>` (body on STDIN) — summarize a tracked file, recording `source_path` + `source_hash` (sha256) in frontmatter for drift detection. `--raw <label>` is the legacy path for untracked input.
* `note --type entity|concept|topic --name <n>` (body on STDIN) — synthesis page.
* `index` — rebuild `index.md`.
* `status [--json]` — report drift between source pages and their tracked files. Each source page classifies as `current`, `stale`, `missing`, or `untracked` (no `source_hash`). Exits 1 if any page is stale or missing.
* `coverage [--json]` — verify declarative source coverage defined in `wiki/tracked.yaml` (`include`/`exclude` globs). Fails on an uncovered in-scope file, a stale exclusion, an excluded-yet-ingested file, an out-of-scope source page, or duplicate claims on one file.
* `check [--json] [--error-on-orphan-notes] [--error-on-untracked-sources]` — the single CI gate. Evaluates schema validity, page identity, broken links, orphan policy, provenance drift, untracked sources, coverage, and index freshness in one read-only pass; exits non-zero on any hard failure. Orphan notes and untracked sources are warnings by default, promotable to errors via the flags.
* `validate` — structural health check (frontmatter, `[[links]]`, orphans, slug collisions, filename/title mismatches).
* `remove --title <t> [--preview]` — atomically delete a page and rebuild generated state; refuses if inbound `[[links]]` exist.
* `rename --old-title <t> --new-title <t> [--preview]` — rename a page and rewrite every inbound `[[link]]` atomically.
* `reindex` — refresh the qmd search index (best-effort; runs automatically after `ingest`/`note`/`index` unless `--no-reindex`).
* `query <q> [--limit] [--chunks] [--verbatim] [--full|--snippet] [--context]` — search via qmd.
* `fmt` — reformat all pages.
* `init [--project-root] [--name]` — idempotently scaffold the entire wiki harness (see [[Init Scaffold Contract]]).
* `report [--yes] [--off] [--flush] [--feedback <t>] [--skill --title <t> --detail <d>]` — review and file Ymir self-reports. With no flags it prints the exact issue body and sends nothing; `--yes` files pending reports and opts in to automatic filing thereafter; `--off` opts out and discards. See [[Ymir Self-Report Design]].
* `help` — full command reference.
* `--version` — the installed Ymir version, read from the `.version` stamp beside the executable.

Two conventions govern failures. Commands are pure functions returning
`{text, exitCode}`, which is what lets tests drive them in-process rather than as
subprocesses. And `cli.ts` wraps `parseAsync` in a single error boundary that
prints one `error:` line: a `Rejection` — a predicted refusal such as a slug
collision or broken link — stops there, while anything unpredicted is also
captured as a self-report.

See [[Wiki Harness Design Spec]] for the original architecture, [[Wiki Schema]] for
the in-wiki rules and command reference, [[Ymir SKILL Dispatcher]] for how the
skill invokes the CLI, and [[Wiki Harness Model]] for the three-layer model this
CLI enforces.
