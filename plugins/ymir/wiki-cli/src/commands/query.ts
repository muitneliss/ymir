import { spawn } from "node:child_process";
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
  runner?: Runner;
}

export function hitCount(json: string): number {
  try {
    const d = JSON.parse(json);
    if (Array.isArray(d)) return d.length;
    return Array.isArray(d?.results) ? d.results.length : 0;
  } catch {
    return 0;
  }
}

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
 * nothing — drop terms the index does not contain, and finally back off by
 * selectivity, keeping the rarest (most informative) terms longest.
 */
export async function runQuery(i: QueryInput): Promise<string> {
  const run = i.runner ?? defaultRunner;

  const exec = (q: string): Promise<string> => {
    const args = ["search", q, "--json", "-c", collectionName(i.root)];
    if (!i.chunks) args.push("--files");
    if (i.limit !== undefined) args.push("-n", String(i.limit));
    return run("qmd", args);
  };

  if (i.verbatim) return exec(i.q);

  const terms = extractTerms(i.q).split(/\s+/).filter(Boolean);
  if (terms.length <= 1) return exec(terms[0] ?? i.q);

  const full = await exec(terms.join(" "));
  if (hitCount(full) > 0 || terms.length > MAX_PROBED_TERMS) return full;

  // Which terms does the index actually contain? A zero-hit term can only ever
  // zero the conjunction, so it is pure noise.
  const counts = await Promise.all(
    terms.map(async (t) => [t, hitCount(await exec(t))] as const),
  );
  const present = counts.filter(([, n]) => n > 0);
  if (present.length === 0) return full;

  if (present.length < terms.length) {
    const out = await exec(present.map(([t]) => t).join(" "));
    if (hitCount(out) > 0) return out;
  }

  // Still nothing: the surviving terms do not co-occur. Shed the least
  // selective (highest document frequency) first — rare terms carry the signal.
  const rarestFirst = [...present].sort((a, b) => a[1] - b[1]);
  for (let n = rarestFirst.length - 1; n >= 1; n--) {
    const out = await exec(rarestFirst.slice(0, n).map(([t]) => t).join(" "));
    if (hitCount(out) > 0) return out;
  }

  return full;
}
