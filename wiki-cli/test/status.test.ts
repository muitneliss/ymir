import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeStatus, hasDrift } from "../src/status.js";
import { sha256Hex } from "../src/hash.js";

function initWiki(projectRoot: string): string {
  const wikiRoot = join(projectRoot, "wiki");
  mkdirSync(join(wikiRoot, "sources"), { recursive: true });
  mkdirSync(join(wikiRoot, "notes"), { recursive: true });
  return wikiRoot;
}

function writeSource(wikiRoot: string, slug: string, fm: Record<string, unknown>, body = "content"): void {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", `# ${fm.title}`, "", body);
  writeFileSync(join(wikiRoot, "sources", `${slug}.md`), lines.join("\n") + "\n");
}

function writeNote(wikiRoot: string, slug: string, fm: Record<string, unknown>, body: string): void {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", `# ${fm.title}`, "", body);
  writeFileSync(join(wikiRoot, "notes", `${slug}.md`), lines.join("\n") + "\n");
}

const BASE_FM = { type: "source", date: "2026-06-17", tags: [], ingested: "2026-06-17" };

describe("computeStatus", () => {
  let projectRoot: string;
  let wikiRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "status-test-"));
    wikiRoot = initWiki(projectRoot);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("classifies source as untracked when source_hash absent", () => {
    writeSource(wikiRoot, "auth", { ...BASE_FM, title: "Auth", source: "src/auth.ts" });
    const r = computeStatus(wikiRoot);
    expect(r.sources[0]?.state).toBe("untracked");
  });

  it("classifies source as missing when source_path file does not exist", () => {
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: "deadbeef",
    });
    const r = computeStatus(wikiRoot);
    expect(r.sources[0]?.state).toBe("missing");
  });

  it("classifies source as stale when hash differs", () => {
    const filePath = join(projectRoot, "src", "auth.ts");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(filePath, "original content");
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: "deadbeef",
    });
    const r = computeStatus(wikiRoot);
    expect(r.sources[0]?.state).toBe("stale");
  });

  it("classifies source as current when hash matches", () => {
    const content = "current content";
    const hash = sha256Hex(content);
    const filePath = join(projectRoot, "src", "auth.ts");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(filePath, content);
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: hash,
    });
    const r = computeStatus(wikiRoot);
    expect(r.sources[0]?.state).toBe("current");
  });

  it("marks note for review when it links to stale source", () => {
    const filePath = join(projectRoot, "src", "auth.ts");
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(filePath, "original content");
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: "deadbeef",
    });
    writeNote(wikiRoot, "auth-overview", {
      title: "Auth Overview", type: "concept", date: "2026-06-17", tags: [], source_count: 1,
    }, "See [[Auth]] for details.");
    const r = computeStatus(wikiRoot);
    expect(r.review).toHaveLength(1);
    expect(r.review[0]?.title).toBe("Auth Overview");
  });

  it("hasDrift returns true when stale source exists", () => {
    writeSource(wikiRoot, "auth", {
      ...BASE_FM, title: "Auth", source: "src/auth.ts",
      source_path: "src/auth.ts", source_hash: "deadbeef",
    });
    const r = computeStatus(wikiRoot);
    expect(hasDrift(r)).toBe(true);
  });

  it("hasDrift returns false when all sources current or untracked", () => {
    writeSource(wikiRoot, "auth", { ...BASE_FM, title: "Auth", source: "src/auth.ts" });
    const r = computeStatus(wikiRoot);
    expect(hasDrift(r)).toBe(false);
  });
});
