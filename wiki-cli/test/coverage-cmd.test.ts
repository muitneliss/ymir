import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCoverage } from "../src/commands/coverage.js";

function initProject(): { projectRoot: string; wikiRoot: string } {
  const projectRoot = mkdtempSync(join(tmpdir(), "coverage-cmd-"));
  const wikiRoot = join(projectRoot, "wiki");
  mkdirSync(join(wikiRoot, "sources"), { recursive: true });
  mkdirSync(join(wikiRoot, "notes"), { recursive: true });
  return { projectRoot, wikiRoot };
}

function writeTracked(wikiRoot: string, yaml: string): void {
  writeFileSync(join(wikiRoot, "tracked.yaml"), yaml);
}

function writeSourcePage(wikiRoot: string, file: string, sourcePath?: string): void {
  const fm: Record<string, unknown> = {
    title: file.replace(/\.md$/, ""),
    type: "source",
    date: "2026-06-17",
    tags: [],
    source: "raw/stub",
    ingested: "2026-06-17",
  };
  if (sourcePath) fm.source_path = sourcePath;
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", `# ${fm.title}`, "", "content");
  writeFileSync(join(wikiRoot, "sources", file), lines.join("\n") + "\n");
}

let projectRoot: string;
let wikiRoot: string;

beforeEach(() => {
  ({ projectRoot, wikiRoot } = initProject());
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("runCoverage", () => {
  it("exits 0 with guidance when no tracked.yaml present", () => {
    const r = runCoverage({ root: wikiRoot, json: false });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("tracked.yaml");
  });

  it("exits 0 when coverage is satisfied", () => {
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "auth.ts"), "content");
    writeTracked(wikiRoot, 'include:\n  - "src/**/*.ts"\n');
    writeSourcePage(wikiRoot, "auth.md", "src/auth.ts");

    const r = runCoverage({ root: wikiRoot, json: false });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("coverage ok");
  });

  it("exits 1 with uncovered violation when file missing a source page", () => {
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "user.ts"), "content");
    writeTracked(wikiRoot, 'include:\n  - "src/**/*.ts"\n');

    const r = runCoverage({ root: wikiRoot, json: false });
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("uncovered");
    expect(r.text).toContain("src/user.ts");
  });

  it("emits JSON when --json flag is set", () => {
    writeTracked(wikiRoot, 'include:\n  - "src/**/*.ts"\n');
    const r = runCoverage({ root: wikiRoot, json: true });
    const parsed = JSON.parse(r.text) as { ok: boolean; violations: unknown[] };
    expect(typeof parsed.ok).toBe("boolean");
    expect(Array.isArray(parsed.violations)).toBe(true);
  });
});
