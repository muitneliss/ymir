import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runStatus } from "../src/commands/status.js";

function initWiki(projectRoot: string): string {
  const wikiRoot = join(projectRoot, "wiki");
  mkdirSync(join(wikiRoot, "sources"), { recursive: true });
  mkdirSync(join(wikiRoot, "notes"), { recursive: true });
  return wikiRoot;
}

function writeSource(wikiRoot: string, slug: string, fm: Record<string, unknown>): void {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", `# ${fm.title}`, "", "body text");
  writeFileSync(join(wikiRoot, "sources", `${slug}.md`), lines.join("\n") + "\n");
}

const BASE_FM = { type: "source", date: "2026-06-17", tags: [], ingested: "2026-06-17" };

describe("runStatus", () => {
  it("returns exit code 0 with no sources", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "status-cmd-"));
    const wikiRoot = initWiki(projectRoot);
    const { exitCode, text } = runStatus({ root: wikiRoot, json: false });
    expect(exitCode).toBe(0);
    expect(text).toContain("up to date");
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns exit code 1 with missing source", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "status-cmd-"));
    const wikiRoot = initWiki(projectRoot);
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: "deadbeef",
    });
    const { exitCode, text } = runStatus({ root: wikiRoot, json: false });
    expect(exitCode).toBe(1);
    expect(text).toContain("missing:");
    expect(text).toContain("Auth");
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("--json emits valid StatusReport JSON", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "status-cmd-"));
    const wikiRoot = initWiki(projectRoot);
    writeSource(wikiRoot, "auth", { ...BASE_FM, title: "Auth", source: "src/auth.ts" });
    const { text } = runStatus({ root: wikiRoot, json: true });
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty("sources");
    expect(parsed).toHaveProperty("review");
    expect(Array.isArray(parsed.sources)).toBe(true);
    rmSync(projectRoot, { recursive: true, force: true });
  });
});
