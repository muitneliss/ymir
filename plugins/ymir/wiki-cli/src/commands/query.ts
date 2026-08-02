import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandContext, DEFAULT_BUDGET } from "../context.js";
import { collectionName } from "../paths.js";
import { extractTerms } from "../query-terms.js";

export type Runner = (cmd: string, args: string[]) => Promise<string>;

/** Terms probed individually on the fallback path; bounds worst-case qmd calls. */
const MAX_PROBED_TERMS = 12;

const defaultRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `qmd exited ${code}`)),
    );
  });

export interface QueryInput {
  root: string;
  q: string;
  /** Cap on results (qmd `-n`). Omitted → qmd's own default. */
  limit?: number;
  /** Return matching chunks instead of whole files (drops qmd `--files`). */
  chunks?: boolean;
  /** Search the query exactly as given, skipping term extraction and backoff. */
  verbatim?: boolean;
  /** Return qmd's raw fixed-width snippet instead of an expanded passage. */
  snippet?: boolean;
  /** Character budget for the expanded passage. */
  context?: number;
  /**
   * Return each hit's whole page body instead of a snippet.
   *
   * qmd's snippet is a few lines around the match (~333 chars against a ~1.9KB
   * page here), and it frequently omits the sentence that actually answers the
   * question. Measured end-to-end on this wiki: with snippets, EVERY case of
   * "correct page ranked first but answer still wrong" was the model reporting
   * insufficient context — 52% of all questions. Ranking was never the limit.
   */
  full?: boolean;
  runner?: Runner;
}

/** A single qmd hit, loosely typed to match whatever fields qmd emits. */
export interface Hit {
  docid?: string;
  score?: number;
  file?: string;
  path?: string;
  line?: number;
  title?: string;
  snippet?: string;
  [key: string]: unknown;
}

/** Parse a qmd JSON response into its hit array, tolerating malformed output. */
function parseHits(json: string): Hit[] {
  try {
    const d = JSON.parse(json);
    if (Array.isArray(d)) return d;
    return Array.isArray(d?.results) ? d.results : [];
  } catch {
    return [];
  }
}

export function hitCount(json: string): number {
  return parseHits(json).length;
}

const fileOf = (h: Hit): string => String(h.file ?? h.path ?? "");

/**
 * Search this wiki.
 *
 * `qmd search` is CONJUNCTIVE: hits fall monotonically as terms are added, and a
 * single term absent from the index drives the whole query to zero results.
 * Measured on this repo's own wiki:
 *
 *   hook                                                  19 hits
 *   sessionstart hook binary download verify                4 hits
 *   happens sessionstart hook fails download verify binary  0 hits   <- "happens"
 *   happens                                                 0 hits      is absent
 *
 * So handing a user's whole question to qmd gets *worse* the more of it we pass
 * on. We therefore reduce to content terms, then — only when that still finds
 * nothing — drop terms the index does not contain, and retry the AND of the
 * survivors.
 *
 * If even that fails, the surviving terms individually match documents but
 * never co-occur — the conjunction is simply too strict to reflect real
 * relevance (design-spec / implementation-plan / notes pages in this wiki
 * paraphrase each other, so a document can be "the" answer without containing
 * every term the LLM's question happened to use). Picking any ONE subset that
 * happens to produce a hit (as an even greedier backoff would) is a coin flip:
 * measured on this wiki's own 44-question eval set, EVERY one of the 16
 * failures under that scheme was a document never retrieved at all, not a
 * ranking problem — so the fix is to retrieve more broadly, not to reorder.
 *
 * We already paid for a single-term probe per surviving term (to learn which
 * terms are present); reuse those results instead of throwing them away.
 * Merge them into one ranked list — a manual OR — ordering documents by
 * *coordination level* (how many distinct query terms matched them, most
 * first) and, within a tie, by their best single-term BM25 score. This adds
 * zero extra qmd calls over the old subset-shedding loop it replaces, and on
 * this wiki recovers 12 of those 16 lost documents into the top 3.
 */
async function runSearch(i: QueryInput): Promise<string> {
  const run = i.runner ?? defaultRunner;

  // NEVER pass --files: qmd lets it override --json and emits CSV instead, which
  // JSON.parse cannot read. hitCount() then saw 0 hits for EVERY default-mode
  // query, so the backoff below always fired, burned a probe per term, found
  // "nothing" each time and returned the raw CSV. File-level results are
  // produced here instead, by collapsing chunk hits to their first occurrence
  // per file — same output shape, and one JSON contract for both modes.
  const exec = async (q: string): Promise<string> => {
    const args = ["search", q, "--json", "-c", collectionName(i.root)];
    if (i.full) args.push("--full");
    if (i.limit !== undefined) args.push("-n", String(i.limit));
    const raw = await run("qmd", args);
    return i.chunks ? raw : JSON.stringify(collapseToFiles(parseHits(raw), i.limit));
  };

  if (i.verbatim) return exec(i.q);

  // Concurrent qmd processes contend on its shared index and intermittently
  // exit non-zero (measured: 1 in 10 parallel probes). Every speculative call
  // below is therefore SEQUENTIAL and failure-tolerant — one flaky probe must
  // never take down the whole query. A real fault (qmd missing) still surfaces:
  // we keep the first error and rethrow it if nothing was ever retrieved.
  let firstError: unknown = null;
  const tryExec = async (q: string): Promise<string> => {
    try {
      return await exec(q);
    } catch (err) {
      firstError ??= err;
      return "";
    }
  };

  const terms = [...new Set(extractTerms(i.q).split(/\s+/).filter(Boolean))];
  if (terms.length <= 1) return exec(terms[0] ?? i.q);

  const full = await tryExec(terms.join(" "));
  if (hitCount(full) > 0) return full;
  if (terms.length > MAX_PROBED_TERMS) {
    if (firstError) throw firstError;
    return full;
  }

  // Which terms does the index actually contain? A zero-hit term can only ever
  // zero the conjunction, so it is pure noise. Keep each term's own hits: the
  // coordination merge below reuses them instead of re-querying.
  const present: [string, number][] = [];
  const termHits = new Map<string, Hit[]>();
  for (const t of terms) {
    const hits = parseHits(await tryExec(t));
    if (hits.length > 0) {
      present.push([t, hits.length]);
      termHits.set(t, hits);
    }
  }
  if (present.length === 0) {
    if (firstError) throw firstError;
    return full;
  }

  if (present.length < terms.length) {
    const out = await tryExec(present.map(([t]) => t).join(" "));
    if (hitCount(out) > 0) return out;
  }

  // Still nothing: the surviving terms do not co-occur as a strict AND. Merge
  // their individual hits into one coordination-ranked list (see doc comment).
  return JSON.stringify(coordinationMerge(termHits, i.limit));
}

/**
 * Merge per-term hit lists into one ranked list: documents matching more
 * distinct query terms rank first (coordination level), ties broken by the
 * best single-term BM25 score seen for that document. Multiple chunks of the
 * same document are kept (dedup'd by docid) and ordered together by score, so
 * the shape stays whatever qmd itself would have emitted.
 */
function coordinationMerge(termHits: Map<string, Hit[]>, limit?: number): Hit[] {
  const coverage = new Map<string, { terms: Set<string>; bestScore: number; hits: Hit[] }>();
  for (const [term, hits] of termHits) {
    for (const h of hits) {
      const key = fileOf(h);
      if (!key) continue;
      let entry = coverage.get(key);
      if (!entry) {
        entry = { terms: new Set(), bestScore: -Infinity, hits: [] };
        coverage.set(key, entry);
      }
      entry.terms.add(term);
      entry.bestScore = Math.max(entry.bestScore, typeof h.score === "number" ? h.score : 0);
      entry.hits.push(h);
    }
  }

  const ranked = [...coverage.values()].sort((a, b) => {
    if (b.terms.size !== a.terms.size) return b.terms.size - a.terms.size;
    return b.bestScore - a.bestScore;
  });

  const merged: Hit[] = [];
  for (const entry of ranked) {
    const seen = new Set<string>();
    const byScore = [...entry.hits].sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
    for (const h of byScore) {
      const id = h.docid ?? `${fileOf(h)}:${h.line ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(h);
    }
  }

  return limit !== undefined ? merged.slice(0, limit) : merged;
}

/**
 * Collapse chunk-level hits to one entry per file, preserving rank order.
 *
 * This replaces qmd's `--files` flag, which cannot be combined with `--json`.
 */
export function collapseToFiles(hits: Hit[], limit?: number): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    const key = fileOf(h);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (limit !== undefined && out.length >= limit) break;
  }
  return out;
}


/** `qmd://<collection>/<relpath>` -> the page's path inside this wiki. */
function localPath(root: string, file: string): string | null {
  const m = file.match(/^qmd:\/\/[^/]+\/(.+)$/);
  return m ? join(root, m[1]!) : null;
}

/**
 * Replace each hit's fixed-width snippet with the passage around the match.
 *
 * Falls back to whatever qmd returned whenever the page cannot be read, so a
 * missing or moved file degrades to the old behaviour rather than failing.
 */
export function enrichHits(hits: Hit[], root: string, budget: number): Hit[] {
  return hits.map((h) => {
    const file = fileOf(h);
    const path = file ? localPath(root, file) : null;
    if (!path || typeof h.line !== "number") return h;
    try {
      const passage = expandContext(readFileSync(path, "utf8"), h.line, budget);
      return passage ? { ...h, snippet: passage } : h;
    } catch {
      return h;
    }
  });
}

/**
 * Search this wiki, returning each hit with enough surrounding text to answer
 * from. See context.ts for why the raw snippet is not enough.
 */
export async function runQuery(i: QueryInput): Promise<string> {
  const raw = await runSearch(i);
  if (i.snippet || i.full) return raw;
  const hits = parseHits(raw);
  if (hits.length === 0) return raw;
  return JSON.stringify(enrichHits(hits, i.root, i.context ?? DEFAULT_BUDGET));
}
