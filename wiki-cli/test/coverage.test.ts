import { describe, it, expect } from "bun:test";
import {
  checkCoverage,
  parseCoverageConfig,
  type CoverageConfig,
  type SourcePageRecord,
} from "../src/coverage.js";

function cfg(include: string[], exclude: { pattern: string; reason: string }[] = []): CoverageConfig {
  return { include, exclude };
}

function src(rel: string, sourcePath?: string): SourcePageRecord {
  return { rel, sourcePath };
}

describe("parseCoverageConfig", () => {
  it("parses include-only config", () => {
    const c = parseCoverageConfig(`include:\n  - "src/**/*.ts"\n`);
    expect(c.include).toEqual(["src/**/*.ts"]);
    expect(c.exclude).toEqual([]);
  });

  it("parses config with exclusions", () => {
    const yaml = [
      "include:",
      '  - "src/**/*.ts"',
      "exclude:",
      "  - pattern: src/generated/**",
      "    reason: auto-generated",
    ].join("\n");
    const c = parseCoverageConfig(yaml);
    expect(c.exclude[0]?.pattern).toBe("src/generated/**");
    expect(c.exclude[0]?.reason).toBe("auto-generated");
  });

  it("rejects exclusion with empty reason", () => {
    const yaml = ['include:\n  - "src/**"', 'exclude:\n  - pattern: "src/x"\n    reason: ""'].join("\n");
    expect(() => parseCoverageConfig(yaml)).toThrow();
  });
});

describe("checkCoverage", () => {
  describe("uncovered", () => {
    it("reports in-scope file with no source page", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [],
      );
      expect(r.ok).toBe(false);
      const v = r.violations.find((x) => x.kind === "uncovered");
      expect(v).toBeDefined();
      expect(v?.file).toBe("src/auth.ts");
      expect(v?.remedy).toContain("wiki ingest");
      expect(v?.remedy).toContain("src/auth.ts");
    });

    it("does not report excluded file as uncovered", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"], [{ pattern: "src/generated/**", reason: "auto-gen" }]),
        ["src/generated/api.ts"],
        [],
      );
      expect(r.violations.filter((v) => v.kind === "uncovered")).toHaveLength(0);
    });

    it("does not report file outside includes as uncovered", () => {
      const r = checkCoverage(cfg(["src/**/*.ts"]), ["README.md"], []);
      expect(r.violations.filter((v) => v.kind === "uncovered")).toHaveLength(0);
    });

    it("handles nested globs correctly", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/a/b/c/deep.ts"],
        [],
      );
      const v = r.violations.find((x) => x.kind === "uncovered" && x.file === "src/a/b/c/deep.ts");
      expect(v).toBeDefined();
    });

    it("does not report in-scope file that is already ingested", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/auth.md", "src/auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "uncovered")).toHaveLength(0);
    });
  });

  describe("stale-exclusion", () => {
    it("reports exclusion pattern that matches no project files", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"], [{ pattern: "src/old/**", reason: "removed" }]),
        ["src/auth.ts"],
        [],
      );
      const v = r.violations.find((x) => x.kind === "stale-exclusion");
      expect(v).toBeDefined();
      expect(v?.pattern).toBe("src/old/**");
      expect(v?.remedy).toContain("src/old/**");
    });

    it("does not report exclusion pattern that matches a file", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"], [{ pattern: "src/generated/**", reason: "auto-gen" }]),
        ["src/generated/api.ts", "src/auth.ts"],
        [src("sources/auth.md", "src/auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "stale-exclusion")).toHaveLength(0);
    });
  });

  describe("excluded-ingested", () => {
    it("reports source page for a file that is now excluded", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"], [{ pattern: "src/generated/**", reason: "auto-gen" }]),
        ["src/generated/api.ts"],
        [src("sources/api.md", "src/generated/api.ts")],
      );
      const v = r.violations.find((x) => x.kind === "excluded-ingested");
      expect(v).toBeDefined();
      expect(v?.file).toBe("src/generated/api.ts");
      expect(v?.pages).toContain("sources/api.md");
      expect(v?.remedy).toBeDefined();
    });

    it("does not report non-excluded ingested files", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/auth.md", "src/auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "excluded-ingested")).toHaveLength(0);
    });
  });

  describe("out-of-scope", () => {
    it("reports source page whose source_path doesn't match any include", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["docs/README.md"],
        [src("sources/readme.md", "docs/README.md")],
      );
      const v = r.violations.find((x) => x.kind === "out-of-scope");
      expect(v).toBeDefined();
      expect(v?.file).toBe("docs/README.md");
      expect(v?.pages).toContain("sources/readme.md");
      expect(v?.remedy).toBeDefined();
    });

    it("does not report in-scope tracked source pages as out-of-scope", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/auth.md", "src/auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "out-of-scope")).toHaveLength(0);
    });

    it("does not report source pages with no source_path", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/manual.md", undefined)],
      );
      expect(r.violations.filter((v) => v.kind === "out-of-scope")).toHaveLength(0);
    });
  });

  describe("duplicate-source", () => {
    it("reports multiple source pages claiming the same file", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [
          src("sources/auth.md", "src/auth.ts"),
          src("sources/auth-v2.md", "src/auth.ts"),
        ],
      );
      const v = r.violations.find((x) => x.kind === "duplicate-source");
      expect(v).toBeDefined();
      expect(v?.file).toBe("src/auth.ts");
      expect(v?.pages).toHaveLength(2);
      expect(v?.remedy).toBeDefined();
    });

    it("does not report when only one source page per file", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/auth.md", "src/auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "duplicate-source")).toHaveLength(0);
    });
  });

  describe("clean config", () => {
    it("returns ok with no violations when fully covered", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"], [{ pattern: "src/generated/**", reason: "auto-gen" }]),
        ["src/auth.ts", "src/user.ts", "src/generated/api.ts"],
        [
          src("sources/auth.md", "src/auth.ts"),
          src("sources/user.md", "src/user.ts"),
        ],
      );
      expect(r.ok).toBe(true);
      expect(r.violations).toHaveLength(0);
    });
  });

  describe("platform path handling", () => {
    it("normalizes backslash paths from source pages to forward slashes", () => {
      const r = checkCoverage(
        cfg(["src/**/*.ts"]),
        ["src/auth.ts"],
        [src("sources/auth.md", "src\\auth.ts")],
      );
      expect(r.violations.filter((v) => v.kind === "uncovered")).toHaveLength(0);
    });
  });
});
