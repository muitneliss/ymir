import { describe, it, expect } from "bun:test";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { computeStatus } from "../src/status.js";

const projectRoot = resolve(import.meta.dir, "../../../../");
const wikiRoot = join(projectRoot, "wiki");

describe("Ymir wiki dogfood provenance", () => {
  it("wiki root exists and is a valid wiki directory", () => {
    expect(existsSync(wikiRoot)).toBe(true);
    expect(existsSync(join(wikiRoot, "sources"))).toBe(true);
    expect(existsSync(join(wikiRoot, "SCHEMA.md"))).toBe(true);
  });

  it("all source pages are tracked (no untracked pages)", () => {
    const report = computeStatus(wikiRoot);
    const untracked = report.sources.filter((s) => s.state === "untracked");
    expect(untracked).toEqual([]);
  });

  it("all tracked source paths point to files that exist", () => {
    const report = computeStatus(wikiRoot);
    const tracked = report.sources.filter((s) => s.source_path !== undefined);
    for (const page of tracked) {
      const abs = join(projectRoot, page.source_path!);
      expect(existsSync(abs)).toBe(true);
    }
  });
});
