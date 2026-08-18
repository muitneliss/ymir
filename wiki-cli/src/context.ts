/**
 * Smart context expansion for search hits.
 *
 * qmd returns a fixed ~333-char window around the matching line. Measured
 * end-to-end on this repo's own wiki, that window omitted the answering
 * sentence about half the time: 52% of questions came back INSUFFICIENT
 * CONTEXT even when the correct page was ranked first.
 *
 * Returning the whole page fixes accuracy but does not scale — on a large wiki
 * a handful of full pages is an enormous amount of context, most of it
 * irrelevant. So expand outward from the match along *semantic* boundaries
 * (paragraphs, bounded by the enclosing markdown section) up to a character
 * budget, instead of either a blind character window or the entire document.
 */

/** A paragraph and the 1-based line range it occupies. */
interface Block {
  text: string;
  start: number;
  end: number;
}

const HEADING = /^(#{1,6})\s/;

/**
 * Default passage budget, in characters (~750 tokens).
 *
 * Chosen so a typical wiki page passes through whole — the wiki's own pages are
 * 1.5-2KB — while a long page is narrowed to the section around the match.
 */
export const DEFAULT_BUDGET = 3000;

function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let buf: string[] = [];
  let start = 1;

  const flush = (end: number) => {
    if (buf.length > 0 && buf.some((l) => l.trim() !== "")) {
      blocks.push({ text: buf.join("\n").trim(), start, end });
    }
    buf = [];
  };

  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (line.trim() === "") {
      flush(n - 1);
      start = n + 1;
      return;
    }
    if (buf.length === 0) start = n;
    buf.push(line);
  });
  flush(lines.length);
  return blocks;
}

/** Strip a leading YAML frontmatter block; it is metadata, not answer text. */
function stripFrontmatter(text: string): string {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? text.slice(m[0].length) : text;
}

/**
 * Expand around `line` to the surrounding passage, within `budget` characters.
 *
 * Expansion never crosses out of the enclosing markdown section: a heading
 * marks a topic change, so text on the other side of one is answering a
 * different question. Within that section, whole paragraphs are added nearest
 * first — after the match, then before it, since prose usually elaborates
 * forwards.
 */
export function expandContext(pageText: string, line: number, budget = DEFAULT_BUDGET): string {
  const lines = pageText.split("\n");
  if (lines.length === 0) return "";

  // A page that fits the budget IS the relevant context — trimming it can only
  // lose the answer. Measured: a 1200-char budget over ~1.7KB pages scored
  // 68.2% because it cut the page's last third, while returning those same
  // pages whole scored 90.9% on LESS total context than five trimmed passages.
  // Only pages too large to send whole get narrowed to their section.
  const whole = stripFrontmatter(pageText).trim();
  if (whole.length <= budget) return whole;

  const blocks = toBlocks(lines);
  if (blocks.length === 0) return stripFrontmatter(pageText).trim();

  let anchor = blocks.findIndex((b) => line >= b.start && line <= b.end);
  if (anchor === -1) {
    // The matched line fell in whitespace: take the next block that starts after it.
    anchor = blocks.findIndex((b) => b.start >= line);
    if (anchor === -1) anchor = blocks.length - 1;
  }

  // Section bounds: nearest heading at or before the anchor, up to the next
  // heading of the same or higher level.
  let lo = 0;
  let level = 0;
  for (let i = anchor; i >= 0; i--) {
    const m = blocks[i]!.text.match(HEADING);
    if (m) {
      lo = i;
      level = m[1]!.length;
      break;
    }
  }
  let hi = blocks.length - 1;
  for (let i = anchor + 1; i < blocks.length; i++) {
    const m = blocks[i]!.text.match(HEADING);
    if (m && m[1]!.length <= level && level > 0) {
      hi = i - 1;
      break;
    }
  }

  const picked = new Set<number>([anchor]);
  let size = blocks[anchor]!.text.length;
  let after = anchor + 1;
  let before = anchor - 1;

  while (size < budget && (after <= hi || before >= lo)) {
    let grew = false;
    if (after <= hi) {
      const b = blocks[after]!;
      if (size + b.text.length <= budget) {
        picked.add(after);
        size += b.text.length;
        grew = true;
      }
      after++;
    }
    if (size < budget && before >= lo) {
      const b = blocks[before]!;
      if (size + b.text.length <= budget) {
        picked.add(before);
        size += b.text.length;
        grew = true;
      }
      before--;
    }
    if (!grew && after > hi && before < lo) break;
  }

  // Always lead with the section heading — it names what the passage is about.
  const headingIdx = blocks[lo]!.text.match(HEADING) ? lo : -1;
  if (headingIdx >= 0) picked.add(headingIdx);

  return [...picked]
    .sort((a, b) => a - b)
    .map((i) => blocks[i]!.text)
    .join("\n\n")
    .trim();
}
