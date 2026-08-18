import { stringifyFrontmatter } from "./frontmatter.js";
import { formatMarkdown } from "./format.js";
import { sourceFrontmatter, noteFrontmatter, type NoteTypeT } from "./schema.js";

export interface SourcePageInput {
  title: string;
  source: string;
  date: string;
  tags: string[];
  body: string;
  sourcePath?: string;
  sourceHash?: string;
}
export interface NotePageInput {
  name: string; type: NoteTypeT; date: string; tags: string[];
  sourceCount: number; body: string;
}

export async function renderSourcePage(i: SourcePageInput): Promise<string> {
  const fm = sourceFrontmatter.parse({
    title: i.title,
    type: "source",
    date: i.date,
    tags: i.tags,
    source: i.source,
    ingested: i.date,
    ...(i.sourcePath !== undefined && { source_path: i.sourcePath }),
    ...(i.sourceHash !== undefined && { source_hash: i.sourceHash }),
  });
  const md = stringifyFrontmatter(`# ${i.title}\n\n${i.body}\n`, fm);
  return formatMarkdown(md);
}

export async function renderNotePage(i: NotePageInput): Promise<string> {
  const fm = noteFrontmatter.parse({
    title: i.name, type: i.type, date: i.date,
    tags: i.tags, source_count: i.sourceCount,
  });
  const md = stringifyFrontmatter(`# ${i.name}\n\n${i.body}\n`, fm);
  return formatMarkdown(md);
}
