export const HELP_TEXT = `wiki — Ymir wiki CLI (the ONLY way to write wiki docs)

You must NOT hand-write or hand-edit files under wiki/sources, wiki/notes,
index.md, or log.md. Use these commands; they format + validate every write.

Commands:
  ingest --raw <path> --title <t>     Ingest a source from wiki/raw into a summary page.
                                      Body is read from STDIN.
  note --type <entity|concept|topic> --name <n>
                                      Create/update a synthesis note. Body from STDIN.
  index                               Rebuild index.md from all pages.
  log <op> <title>                    Append a dated entry to log.md.
  remove --title <t> [--preview]       Delete a source or note and rebuild all generated state.
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
  help                                Show this text.

Page conventions:
  Source page frontmatter: title, type=source, date, tags[], source, ingested
  Note page frontmatter:   title, type=entity|concept|topic, date, tags[], source_count
  Cross-reference other pages with [[Exact Title]].

Examples:
  echo "Key points..." | wiki ingest --raw raw/paper.pdf --title "Rate Limiting"
  echo "A token-bucket limiter. See [[Rate Limiting]]." | wiki note --type concept --name "Token Bucket"
  wiki query "how does backoff work"
  wiki query "backoff" --limit 20 --chunks
  wiki validate
`;

export function runHelp(): void {
  process.stdout.write(HELP_TEXT);
}
