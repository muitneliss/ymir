import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { load, JSON_SCHEMA } from "js-yaml";
import { minimatch } from "minimatch";
import { z } from "zod";
import { parseFrontmatter } from "./frontmatter.js";
import { listPages } from "./store.js";

const ExclusionRuleSchema = z.object({
  pattern: z.string().min(1),
  reason: z.string().min(1),
});

const CoverageConfigSchema = z.object({
  include: z.array(z.string().min(1)),
  exclude: z.array(ExclusionRuleSchema).default([]),
});

export type CoverageConfig = z.infer<typeof CoverageConfigSchema>;
export type ExclusionRule = z.infer<typeof ExclusionRuleSchema>;

export type ViolationKind =
  | "uncovered"
  | "stale-exclusion"
  | "excluded-ingested"
  | "out-of-scope"
  | "duplicate-source";

export interface CoverageViolation {
  kind: ViolationKind;
  file?: string;
  pattern?: string;
  pages?: string[];
  remedy: string;
}

export interface CoverageReport {
  ok: boolean;
  violations: CoverageViolation[];
}

export interface SourcePageRecord {
  rel: string;
  sourcePath?: string;
}

export function parseCoverageConfig(raw: string): CoverageConfig {
  const parsed = load(raw, { schema: JSON_SCHEMA });
  return CoverageConfigSchema.parse(parsed);
}

export function loadCoverageConfig(wikiRoot: string): CoverageConfig | null {
  const configPath = join(wikiRoot, "tracked.yaml");
  if (!existsSync(configPath)) return null;
  return parseCoverageConfig(readFileSync(configPath, "utf8"));
}

function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(file, p, { dot: true }));
}

export function collectProjectFiles(projectRoot: string): string[] {
  try {
    const out = execSync("git ls-files", { cwd: projectRoot, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    return out.trim().split("\n").filter(Boolean).map(toForwardSlash);
  } catch {
    return walkDir(projectRoot, projectRoot);
  }
}

function walkDir(dir: string, root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkDir(abs, root));
    } else {
      result.push(toForwardSlash(abs.slice(root.length + 1)));
    }
  }
  return result;
}

export function loadSourcePages(sourcesDir: string): SourcePageRecord[] {
  return listPages(sourcesDir).map((file) => {
    const rel = `sources/${file}`;
    const { data } = parseFrontmatter(readFileSync(join(sourcesDir, file), "utf8"));
    const rawPath = (data as { source_path?: string }).source_path;
    return { rel, sourcePath: rawPath ? toForwardSlash(rawPath) : undefined };
  });
}

export function checkCoverage(
  config: CoverageConfig,
  projectFiles: string[],
  sourcePages: SourcePageRecord[],
): CoverageReport {
  const violations: CoverageViolation[] = [];
  const excludePatterns = config.exclude.map((e) => e.pattern);

  const normalizedPages = sourcePages.map((p) => ({
    ...p,
    sourcePath: p.sourcePath ? toForwardSlash(p.sourcePath) : undefined,
  }));

  const ingestedMap = new Map<string, string[]>();
  for (const page of normalizedPages) {
    if (!page.sourcePath) continue;
    const existing = ingestedMap.get(page.sourcePath) ?? [];
    existing.push(page.rel);
    ingestedMap.set(page.sourcePath, existing);
  }

  const inScopeFiles = projectFiles.filter(
    (f) => matchesAny(f, config.include) && !matchesAny(f, excludePatterns),
  );

  for (const file of inScopeFiles) {
    if (!ingestedMap.has(file)) {
      violations.push({
        kind: "uncovered",
        file,
        remedy: `run: wiki ingest --source ${file} --title "<title>"`,
      });
    }
  }

  for (const rule of config.exclude) {
    const hasMatch = projectFiles.some((f) => minimatch(f, rule.pattern, { dot: true }));
    if (!hasMatch) {
      violations.push({
        kind: "stale-exclusion",
        pattern: rule.pattern,
        remedy: `remove the exclusion "${rule.pattern}" from tracked.yaml (no files match it)`,
      });
    }
  }

  for (const [sourcePath, pages] of ingestedMap) {
    if (matchesAny(sourcePath, excludePatterns)) {
      violations.push({
        kind: "excluded-ingested",
        file: sourcePath,
        pages,
        remedy: `remove the source page or remove the exclusion covering "${sourcePath}" from tracked.yaml`,
      });
    } else if (!matchesAny(sourcePath, config.include)) {
      violations.push({
        kind: "out-of-scope",
        file: sourcePath,
        pages,
        remedy: `add "${sourcePath}" to tracked.yaml includes or remove the source page`,
      });
    }

    if (pages.length > 1) {
      violations.push({
        kind: "duplicate-source",
        file: sourcePath,
        pages,
        remedy: `keep one source page for "${sourcePath}" and remove the duplicates: ${pages.join(", ")}`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
