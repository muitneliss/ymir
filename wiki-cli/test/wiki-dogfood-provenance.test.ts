import { describe, it, expect } from "bun:test";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { computeStatus } from "../src/status.js";
import { runCoverage } from "../src/commands/coverage.js";

const projectRoot = resolve(import.meta.dir, "../../");
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

  it("wiki/tracked.yaml exists and declares coverage policy", () => {
    const trackedPath = join(wikiRoot, "tracked.yaml");
    expect(existsSync(trackedPath)).toBe(true);
  });

  it("coverage check passes — every in-scope file is ingested or explicitly excluded", () => {
    const r = runCoverage({ root: wikiRoot, json: false });
    if (r.exitCode !== 0) {
      console.log("Coverage violations:\n" + r.text);
    }
    expect(r.exitCode).toBe(0);
  });
});
