import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCheck } from "../src/check.js";
import { buildIndex } from "../src/index-build.js";
import { writePage } from "../src/store.js";

function initProject(): { projectRoot: string; root: string } {
  const projectRoot = mkdtempSync(join(tmpdir(), "check-"));
  const root = join(projectRoot, "wiki");
  mkdirSync(join(root, "sources"), { recursive: true });
  mkdirSync(join(root, "notes"), { recursive: true });
  return { projectRoot, root };
}

function writeSource(root: string, file: string, overrides: Record<string, unknown> = {}): void {
  const fm = {
    title: file.replace(/\.md$/, ""),
    type: "source",
    date: "2026-01-01",
    tags: [],
    source: "raw/stub",
    ingested: "2026-01-01",
    ...overrides,
  };
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---", `# ${fm.title}`, "", "content");
  writeFileSync(join(root, "sources", file), lines.join("\n") + "\n");
}

function writeNote(root: string, file: string, body = "", overrides: Record<string, unknown> = {}): void {
  const title = file.replace(/\.md$/, "");
  const fm = {
    title,
    type: "concept",
    date: "2026-01-01",
    tags: [],
    source_count: 0,
    ...overrides,
  };
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else lines.push(`${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---", `# ${title}`, "", body);
  writeFileSync(join(root, "notes", file), lines.join("\n") + "\n");
}

function writeIndex(root: string): void {
  writePage(join(root, "index.md"), buildIndex(root));
}

let projectRoot: string;
let root: string;

beforeEach(() => {
  ({ projectRoot, root } = initProject());
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("runCheck", () => {
  describe("schema and structure", () => {
    it("passes a valid empty wiki", () => {
      writeIndex(root);
      const r = runCheck({ root });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    });

    it("reports schema-invalid error for bad frontmatter", () => {
      writeFileSync(join(root, "notes", "bad.md"), "---\ntitle: Bad\ntype: nope\n---\n# Bad\n");
      const r = runCheck({ root });
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => e.kind === "schema-invalid" && e.path?.includes("bad.md"))).toBe(true);
    });

    it("reports broken-link error", () => {
      writeNote(root, "a.md", "see [[Ghost]]");
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "broken-link" && e.message.includes("Ghost"))).toBe(true);
    });

    it("reports slug-collision error", () => {
      writeSource(root, "hi-u-tr-ng.md", { title: "Hiệu trưởng" });
      writeNote(root, "hi-u-tr-ng.md", "", { title: "Hiếu trường" });
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "slug-collision")).toBe(true);
    });

    it("reports filename-mismatch error", () => {
      writeNote(root, "wrong-name.md", "", { title: "Right Name" });
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "filename-mismatch" && e.path?.includes("wrong-name.md"))).toBe(true);
    });

    it("reports nested-page error", () => {
      mkdirSync(join(root, "notes", "sub"), { recursive: true });
      writeFileSync(join(root, "notes", "sub", "deep.md"), "---\ntitle: Deep\ntype: concept\ndate: 2026-01-01\ntags: []\nsource_count: 0\n---\n# Deep\n");
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "nested-page")).toBe(true);
    });
  });

  describe("orphan notes", () => {
    it("warns on orphan note by default", () => {
      writeNote(root, "alone.md");
      writeIndex(root);
      const r = runCheck({ root });
      expect(r.warnings.some((w) => w.kind === "orphan-note" && w.path?.includes("alone.md"))).toBe(true);
      expect(r.ok).toBe(true);
    });

    it("errors on orphan note when errorOnOrphanNotes is true", () => {
      writeNote(root, "alone.md");
      writeIndex(root);
      const r = runCheck({ root, errorOnOrphanNotes: true });
      expect(r.errors.some((e) => e.kind === "orphan-note")).toBe(true);
      expect(r.ok).toBe(false);
    });
  });

  describe("provenance drift", () => {
    it("reports stale-source error when source hash changed", () => {
      writeFileSync(join(projectRoot, "src.ts"), "original content");
      writeSource(root, "my-source.md", {
        title: "My Source",
        source_path: "src.ts",
        source_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "stale-source")).toBe(true);
      expect(r.ok).toBe(false);
    });

    it("reports missing-source error when source file not found", () => {
      writeSource(root, "my-source.md", {
        title: "My Source",
        source_path: "nonexistent.ts",
        source_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });

      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "missing-source")).toBe(true);
      expect(r.ok).toBe(false);
    });

    it("warns on untracked-source by default", () => {
      writeSource(root, "my-source.md", { title: "My Source" });
      writeIndex(root);
      const r = runCheck({ root });
      expect(r.warnings.some((w) => w.kind === "untracked-source")).toBe(true);
      expect(r.ok).toBe(true);
    });

    it("errors on untracked-source when errorOnUntrackedSources is true", () => {
      writeSource(root, "my-source.md", { title: "My Source" });
      writeIndex(root);
      const r = runCheck({ root, errorOnUntrackedSources: true });
      expect(r.errors.some((e) => e.kind === "untracked-source")).toBe(true);
      expect(r.ok).toBe(false);
    });
  });

  describe("index freshness", () => {
    it("passes when index is up to date", () => {
      writeSource(root, "my-source.md", { title: "My Source" });
      writeIndex(root);
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "stale-index")).toBe(false);
    });

    it("reports stale-index error when index.md is missing", () => {
      writeSource(root, "my-source.md", { title: "My Source" });
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "stale-index")).toBe(true);
      expect(r.ok).toBe(false);
    });

    it("reports stale-index error when index.md content is outdated", () => {
      writeSource(root, "my-source.md", { title: "My Source" });
      writePage(join(root, "index.md"), "# Wiki Index\n\n## Sources\n\n_none yet_\n\n## Notes\n\n_none yet_\n");
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "stale-index")).toBe(true);
    });
  });

  describe("coverage", () => {
    it("passes when no tracked.yaml exists", () => {
      writeIndex(root);
      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind?.startsWith("coverage-"))).toBe(false);
    });

    it("reports coverage-uncovered when file lacks a source page", () => {
      mkdirSync(join(projectRoot, "src"), { recursive: true });
      writeFileSync(join(projectRoot, "src", "auth.ts"), "content");
      writeFileSync(join(root, "tracked.yaml"), 'include:\n  - "src/**/*.ts"\n');

      const r = runCheck({ root });
      expect(r.errors.some((e) => e.kind === "coverage-uncovered" && e.path?.includes("auth.ts"))).toBe(true);
      expect(r.ok).toBe(false);
    });
  });

  describe("JSON output schema", () => {
    it("returns stable CheckReport shape with ok, errors, warnings", () => {
      writeIndex(root);
      const r = runCheck({ root });
      expect(typeof r.ok).toBe("boolean");
      expect(Array.isArray(r.errors)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
    });

    it("every finding has kind and message", () => {
      writeNote(root, "alone.md");
      writeIndex(root);
      const r = runCheck({ root });
      for (const f of [...r.errors, ...r.warnings]) {
        expect(typeof f.kind).toBe("string");
        expect(typeof f.message).toBe("string");
      }
    });
  });
});
