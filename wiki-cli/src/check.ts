import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateWiki } from "./validate.js";
import { computeStatus } from "./status.js";
import { loadCoverageConfig, collectProjectFiles, loadSourcePages, checkCoverage } from "./coverage.js";
import { buildIndex } from "./index-build.js";
import { wikiPaths } from "./paths.js";

export type CheckKind =
  | "schema-invalid"
  | "nested-page"
  | "filename-mismatch"
  | "slug-collision"
  | "broken-link"
  | "orphan-note"
  | "stale-source"
  | "missing-source"
  | "untracked-source"
  | "coverage-uncovered"
  | "coverage-stale-exclusion"
  | "coverage-excluded-ingested"
  | "coverage-out-of-scope"
  | "coverage-duplicate-source"
  | "stale-index";

export interface CheckFinding {
  kind: CheckKind;
  path?: string;
  message: string;
  remedy?: string;
}

export interface CheckReport {
  ok: boolean;
  errors: CheckFinding[];
  warnings: CheckFinding[];
}

export interface CheckOptions {
  root: string;
  errorOnOrphanNotes?: boolean;
  errorOnUntrackedSources?: boolean;
}

function classifyValidateErrors(errors: string[]): CheckFinding[] {
  return errors.map((msg) => {
    const kind = inferValidateKind(msg);
    const path = extractPath(msg);
    return { kind, path, message: msg, remedy: extractRemedy(msg) };
  });
}

function inferValidateKind(msg: string): CheckKind {
  if (msg.includes("invalid frontmatter")) return "schema-invalid";
  if (msg.includes("nested page")) return "nested-page";
  if (msg.includes("filename")) return "filename-mismatch";
  if (msg.includes("slug collision")) return "slug-collision";
  if (msg.includes("broken link")) return "broken-link";
  return "schema-invalid";
}

function extractPath(msg: string): string | undefined {
  const m = /^((?:sources|notes)\/[^:]+):/.exec(msg);
  return m ? m[1] : undefined;
}

function extractRemedy(msg: string): string | undefined {
  const m = /— (.+)$/.exec(msg);
  return m ? m[1] : undefined;
}

function checkIndexFreshness(root: string): CheckFinding | null {
  const indexPath = wikiPaths(root).index;
  if (!existsSync(indexPath)) {
    return {
      kind: "stale-index",
      path: "index.md",
      message: "index.md is missing",
      remedy: "run: wiki index",
    };
  }
  const current = readFileSync(indexPath, "utf8");
  const expected = buildIndex(root);
  if (current !== expected) {
    return {
      kind: "stale-index",
      path: "index.md",
      message: "index.md is out of date",
      remedy: "run: wiki index",
    };
  }
  return null;
}

export function runCheck(opts: CheckOptions): CheckReport {
  const { root, errorOnOrphanNotes = false, errorOnUntrackedSources = false } = opts;

  const errors: CheckFinding[] = [];
  const warnings: CheckFinding[] = [];

  const validation = validateWiki(root);
  errors.push(...classifyValidateErrors(validation.errors));

  for (const w of validation.warnings) {
    const finding: CheckFinding = {
      kind: "orphan-note",
      path: extractOrphanPath(w),
      message: w,
      remedy: "add a link to this note from a source or another note",
    };
    if (errorOnOrphanNotes) errors.push(finding);
    else warnings.push(finding);
  }

  const status = computeStatus(root);
  for (const s of status.sources) {
    if (s.state === "stale") {
      errors.push({
        kind: "stale-source",
        path: s.rel,
        message: `stale source: ${s.title} ← ${s.source_path} (changed)`,
        remedy: `re-ingest from ${s.source_path}`,
      });
    } else if (s.state === "missing") {
      errors.push({
        kind: "missing-source",
        path: s.rel,
        message: `missing source: ${s.title} ← ${s.source_path ?? "(unknown)"} (not found)`,
        remedy: `update source_path or remove the source page`,
      });
    } else if (s.state === "untracked") {
      const finding: CheckFinding = {
        kind: "untracked-source",
        path: s.rel,
        message: `untracked source: ${s.title} (no source_path recorded)`,
        remedy: `re-ingest with --source <file> to record provenance`,
      };
      if (errorOnUntrackedSources) errors.push(finding);
      else warnings.push(finding);
    }
  }

  const projectRoot = resolve(root, "..");
  const coverageConfig = loadCoverageConfig(root);
  if (coverageConfig) {
    const projectFiles = collectProjectFiles(projectRoot);
    const paths = wikiPaths(root);
    const sourcePages = loadSourcePages(paths.sourcesDir);
    const coverage = checkCoverage(coverageConfig, projectFiles, sourcePages);
    for (const v of coverage.violations) {
      errors.push({
        kind: `coverage-${v.kind}` as CheckKind,
        path: v.file,
        message: formatCoverageViolation(v.kind, v.file, v.pattern, v.pages),
        remedy: v.remedy,
      });
    }
  }

  const indexFinding = checkIndexFreshness(root);
  if (indexFinding) errors.push(indexFinding);

  return { ok: errors.length === 0, errors, warnings };
}

function extractOrphanPath(msg: string): string | undefined {
  const m = /orphan note: (notes\/[^\s(]+)/.exec(msg);
  return m ? m[1] : undefined;
}

function formatCoverageViolation(
  kind: string,
  file?: string,
  pattern?: string,
  pages?: string[],
): string {
  switch (kind) {
    case "uncovered": return `uncovered: ${file}`;
    case "stale-exclusion": return `stale exclusion pattern: "${pattern}"`;
    case "excluded-ingested": return `excluded but ingested: ${file} (${pages?.join(", ")})`;
    case "out-of-scope": return `out-of-scope source page: ${file} (${pages?.join(", ")})`;
    case "duplicate-source": return `duplicate source: ${file} claimed by ${pages?.join(", ")}`;
    default: return `coverage violation: ${file ?? pattern}`;
  }
}
