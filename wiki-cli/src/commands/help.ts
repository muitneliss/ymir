export const HELP_TEXT = `wiki — Ymir wiki CLI (the ONLY way to write wiki docs)

You must NOT hand-write or hand-edit files under wiki/sources, wiki/notes,
index.md, or log.md. Use these commands; they format + validate every write.

Commands:
  init [--project-root <dir>] [--name <n>]
                                      Scaffold a wiki in the project: creates wiki/ dirs,
                                      SCHEMA.md, index.md, log.md, a block-wiki-edits hook,
                                      and merges .claude/settings.json. Safe to re-run.
  ingest --source <path> --title <t>  Ingest a project file into a tracked source page.
                                      Records source_path + source_hash for drift detection.
                                      Body is read from STDIN.
  ingest --raw <label> --title <t>    Ingest external material (e.g. wiki/raw/paper.pdf).
                                      No provenance hash — page is untracked by status.
                                      Use --source instead for any file that lives in the repo.
                                      Body is read from STDIN.
  note --type <entity|concept|topic> --name <n>
                                      Create/update a synthesis note. Body from STDIN.
  status [--json]                     Show drift between source pages and their tracked files.
                                      States: current (hash matches), stale (file changed),
                                      missing (file deleted), untracked (no source_hash).
                                      Exit 1 if any page is stale or missing.
  index                               Rebuild index.md from all pages.
  log <op> <title>                    Append a dated entry to log.md.
  check [--json] [--error-on-orphan-notes] [--error-on-untracked-sources]
                                      Single CI gate: validates schema, links, orphans,
                                      provenance drift, coverage, and index freshness.
                                      Exit !=0 on any hard failure.
  remove --title <t> [--preview]      Delete a source or note and rebuild all generated state.
                                      Refuses if inbound [[links]] exist — fix those first.
                                      --preview: report impact without writing.
  rename --old-title <t> --new-title <t> [--preview]
                                      Rename a page, rewrite all inbound [[links]], and
                                      rebuild generated state atomically.
                                      --preview: show link count and affected paths.
  validate                            Check frontmatter, [[links]], orphans, slug collisions,
                                      filename/title mismatches, and nested pages.
                                      Exit !=0 on error.
  fmt                                 Format all wiki markdown (remark).
  query <q> [--limit <n>] [--chunks] [--verbatim]
                                      Search this wiki via qmd (read side). Scoped to
                                      this project's collection. Search is BM25, so
                                      the query is reduced to its content words
                                      first ("When did she paint?" -> "paint");
                                      --verbatim searches the text exactly as typed.
                                      --chunks returns matching passages instead of
                                      whole files.
  report [--yes|--off|--flush]        Review and file Ymir self-reports. With no flags it
                                      prints the exact issue text that would be posted and
                                      sends nothing. --yes opts in and files them; after
                                      that they are filed automatically. --off opts out and
                                      discards anything captured.
                                      --feedback "<text>" records an improvement idea;
                                      --skill --title <t> --detail <d> records a skill-flow
                                      failure the CLI could not see itself.
                                      Reports carry the command, error, version and platform
                                      only — paths, hostnames, credentials and identities are
                                      stripped. Nothing is sent until you opt in. Disable
                                      entirely with DO_NOT_TRACK=1, DISABLE_TELEMETRY=1, or
                                      YMIR_REPORT=off; retarget with YMIR_REPORT_REPO.
  help                                Show this text.

Page conventions:
  Source page frontmatter: title, type=source, date, tags[], source_path, source_hash, ingested
  Note page frontmatter:   title, type=entity|concept|topic, date, tags[], source_count
  Cross-reference other pages with [[Exact Title]].

Examples:
  wiki init
  echo "Key points..." | wiki ingest --source src/auth.ts --title "Auth Module"
  echo "External notes..." | wiki ingest --raw raw/paper.pdf --title "Rate Limiting"
  echo "A token-bucket limiter. See [[Rate Limiting]]." | wiki note --type concept --name "Token Bucket"
  wiki status
  wiki query "how does backoff work"
  wiki query "backoff" --limit 20 --chunks
  wiki validate
`;

export function runHelp(): void {
  process.stdout.write(HELP_TEXT);
}
