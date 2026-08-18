import { resolve } from "node:path";
import { wikiPaths } from "../paths.js";
import {
  loadCoverageConfig,
  collectProjectFiles,
  loadSourcePages,
  checkCoverage,
  type CoverageViolation,
} from "../coverage.js";

export interface CoverageInput {
  root: string;
  json: boolean;
}

export interface CoverageOutput {
  text: string;
  exitCode: number;
}

function formatViolation(v: CoverageViolation): string {
  switch (v.kind) {
    case "uncovered":
      return `uncovered: ${v.file}\n  remedy: ${v.remedy}`;
    case "stale-exclusion":
      return `stale exclusion: "${v.pattern}"\n  remedy: ${v.remedy}`;
    case "excluded-ingested":
      return `excluded but ingested: ${v.file} (${v.pages?.join(", ")})\n  remedy: ${v.remedy}`;
    case "out-of-scope":
      return `out-of-scope source page: ${v.file} (${v.pages?.join(", ")})\n  remedy: ${v.remedy}`;
    case "duplicate-source":
      return `duplicate source: ${v.file} claimed by ${v.pages?.join(", ")}\n  remedy: ${v.remedy}`;
  }
}

export function runCoverage(i: CoverageInput): CoverageOutput {
  const paths = wikiPaths(i.root);
  const projectRoot = resolve(i.root, "..");

  const config = loadCoverageConfig(i.root);
  if (!config) {
    return {
      text: `no tracked.yaml found in ${i.root} — create one to enable coverage checks\n`,
      exitCode: 0,
    };
  }

  const projectFiles = collectProjectFiles(projectRoot);
  const sourcePages = loadSourcePages(paths.sourcesDir);
  const report = checkCoverage(config, projectFiles, sourcePages);

  if (i.json) {
    return { text: JSON.stringify(report, null, 2) + "\n", exitCode: report.ok ? 0 : 1 };
  }

  if (report.ok) {
    return { text: "coverage ok\n", exitCode: 0 };
  }

  const lines = report.violations.map(formatViolation);
  return { text: lines.join("\n") + "\n", exitCode: 1 };
}
