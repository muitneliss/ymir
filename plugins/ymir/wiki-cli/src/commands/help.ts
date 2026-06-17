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
  validate                            Check frontmatter, [[links]], orphans. Exit !=0 on error.
  fmt                                 Format all wiki markdown (remark).
  query <q>                           Search the wiki via qmd (read side).
  help                                Show this text.

Page conventions:
  Source page frontmatter: title, type=source, date, tags[], source, ingested
  Note page frontmatter:   title, type=entity|concept|topic, date, tags[], source_count
  Cross-reference other pages with [[Exact Title]].

Examples:
  echo "Key points..." | wiki ingest --raw raw/paper.pdf --title "Rate Limiting"
  echo "A token-bucket limiter. See [[Rate Limiting]]." | wiki note --type concept --name "Token Bucket"
  wiki query "how does backoff work"
  wiki validate
`;

export function runHelp(): void {
  process.stdout.write(HELP_TEXT);
}
