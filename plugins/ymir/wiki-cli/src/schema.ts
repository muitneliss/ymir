import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const NoteType = z.enum(["entity", "concept", "topic"]);
export type NoteTypeT = z.infer<typeof NoteType>;

export const sourceFrontmatter = z.object({
  title: z.string().min(1),
  type: z.literal("source"),
  date: isoDate,
  tags: z.array(z.string()),
  source: z.string().min(1),
  ingested: isoDate,
});
export type SourceFrontmatter = z.infer<typeof sourceFrontmatter>;

export const noteFrontmatter = z.object({
  title: z.string().min(1),
  type: NoteType,
  date: isoDate,
  tags: z.array(z.string()),
  source_count: z.number().int().nonnegative(),
});
export type NoteFrontmatter = z.infer<typeof noteFrontmatter>;
