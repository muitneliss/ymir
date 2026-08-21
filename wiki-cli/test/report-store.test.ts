import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  saveConfig,
  spool,
  pending,
  resolvePosted,
  postedIssue,
  clearSpool,
  reportHome,
  SPOOL_LIMIT,
} from "../src/report/store.js";
import type { Report } from "../src/report/model.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "report-store-"));
});

function report(over: Partial<Report> = {}): Report {
  return {
    schema: 1,
    kind: "cli-error",
    fingerprint: "aaaaaaaaaaaa",
    command: "wiki note",
    errorName: "ZodError",
    message: "bad type",
    version: "0.7.0",
    platform: "darwin-arm64",
    firstSeen: "2026-08-21T00:00:00.000Z",
    lastSeen: "2026-08-21T00:00:00.000Z",
    occurrences: 1,
    ...over,
  };
}

describe("consent resolution", () => {
  it("defaults to unset — spool locally, post nothing", () => {
    expect(loadConfig(root, {}).mode).toBe("unset");
  });

  it("reads an opted-in config", () => {
    saveConfig(root, { mode: "auto" });
    expect(loadConfig(root, {}).mode).toBe("auto");
  });

  it.each(["DO_NOT_TRACK", "DISABLE_TELEMETRY"])("%s forces off even when opted in", (key) => {
    saveConfig(root, { mode: "auto" });
    expect(loadConfig(root, { [key]: "1" }).mode).toBe("off");
  });

  it("ignores DO_NOT_TRACK=0", () => {
    saveConfig(root, { mode: "auto" });
    expect(loadConfig(root, { DO_NOT_TRACK: "0" }).mode).toBe("auto");
  });

  it("YMIR_REPORT=off overrides an opted-in config", () => {
    saveConfig(root, { mode: "auto" });
    expect(loadConfig(root, { YMIR_REPORT: "off" }).mode).toBe("off");
  });

  it("YMIR_REPORT=auto opts in without a config file", () => {
    expect(loadConfig(root, { YMIR_REPORT: "auto" }).mode).toBe("auto");
  });

  it("survives a corrupt config rather than crashing the CLI", () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "config.json"), "{ not json");
    expect(loadConfig(root, {}).mode).toBe("unset");
  });
});

describe("destination repo", () => {
  it("defaults upstream", () => {
    expect(loadConfig(root, {}).repo).toBe("muitneliss/ymir");
  });

  it("honours a configured fork", () => {
    saveConfig(root, { repo: "acme/ymir-internal" });
    expect(loadConfig(root, {}).repo).toBe("acme/ymir-internal");
  });

  it("lets the environment win", () => {
    saveConfig(root, { repo: "acme/ymir-internal" });
    expect(loadConfig(root, { YMIR_REPORT_REPO: "other/repo" }).repo).toBe("other/repo");
  });

  it("rejects a malformed repo and falls back upstream", () => {
    expect(loadConfig(root, { YMIR_REPORT_REPO: "not a repo" }).repo).toBe("muitneliss/ymir");
  });
});

describe("spool", () => {
  it("round-trips one report", () => {
    spool(root, report());
    const all = pending(root);
    expect(all).toHaveLength(1);
    expect(all[0]!.command).toBe("wiki note");
  });

  it("merges a recurrence instead of duplicating it", () => {
    spool(root, report());
    spool(root, report({ lastSeen: "2026-08-22T00:00:00.000Z" }));

    const all = pending(root);
    expect(all).toHaveLength(1);
    expect(all[0]!.occurrences).toBe(2);
    expect(all[0]!.firstSeen).toBe("2026-08-21T00:00:00.000Z");
    expect(all[0]!.lastSeen).toBe("2026-08-22T00:00:00.000Z");
  });

  it("keeps distinct fingerprints apart", () => {
    spool(root, report({ fingerprint: "aaaaaaaaaaaa" }));
    spool(root, report({ fingerprint: "bbbbbbbbbbbb" }));
    expect(pending(root)).toHaveLength(2);
  });

  it("caps the spool, evicting the least recently seen", () => {
    for (let i = 0; i < SPOOL_LIMIT + 10; i++) {
      spool(
        root,
        report({
          fingerprint: String(i).padStart(12, "0"),
          lastSeen: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      );
    }
    expect(pending(root).length).toBeLessThanOrEqual(SPOOL_LIMIT);
  });

  it("ignores a corrupt spool entry instead of failing the whole read", () => {
    spool(root, report());
    writeFileSync(join(root, "reports", "garbage.json"), "{{{");
    expect(pending(root)).toHaveLength(1);
  });

  it("never throws when the home directory cannot be written", () => {
    const locked = mkdtempSync(join(tmpdir(), "report-locked-"));
    chmodSync(locked, 0o500);
    expect(() => spool(join(locked, "nested"), report())).not.toThrow();
    chmodSync(locked, 0o700);
  });
});

describe("hook records", () => {
  it("adopts JSONL dropped by a hook that cannot import the CLI", () => {
    mkdirSync(join(root, "reports", "incoming"), { recursive: true });
    writeFileSync(
      join(root, "reports", "incoming", "hook.jsonl"),
      JSON.stringify({
        kind: "hook",
        command: "ensure-wiki-binary",
        errorName: "InstallError",
        message: "sha256 mismatch",
      }) + "\n",
    );

    const all = pending(root);
    expect(all).toHaveLength(1);
    expect(all[0]!.kind).toBe("hook");
    expect(all[0]!.fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  it("skips malformed JSONL lines", () => {
    mkdirSync(join(root, "reports", "incoming"), { recursive: true });
    writeFileSync(join(root, "reports", "incoming", "hook.jsonl"), "not json\n");
    expect(pending(root)).toHaveLength(0);
  });

  it("redacts adopted records — a hook message quotes whatever path failed", () => {
    mkdirSync(join(root, "reports", "incoming"), { recursive: true });
    writeFileSync(
      join(root, "reports", "incoming", "hook.jsonl"),
      JSON.stringify({
        kind: "hook",
        command: "ensure-wiki-binary",
        errorName: "ManifestUnreadable",
        message: "ENOENT: /Users/alice/.claude/plugins/ymir/plugin.json",
      }) + "\n",
    );

    expect(JSON.stringify(pending(root))).not.toContain("alice");
  });

  it("consumes the incoming file so a record is adopted once", () => {
    mkdirSync(join(root, "reports", "incoming"), { recursive: true });
    writeFileSync(
      join(root, "reports", "incoming", "hook.jsonl"),
      JSON.stringify({ kind: "hook", command: "h", errorName: "E", message: "boom" }) + "\n",
    );

    expect(pending(root)).toHaveLength(1);
    expect(pending(root)[0]!.occurrences).toBe(1);
  });
});

describe("posted map", () => {
  it("remembers the issue a fingerprint became, and clears the spool entry", () => {
    spool(root, report());
    resolvePosted(root, "aaaaaaaaaaaa", 42);

    expect(postedIssue(root, "aaaaaaaaaaaa")).toBe(42);
    expect(pending(root)).toHaveLength(0);
  });

  it("returns null for an unknown fingerprint", () => {
    expect(postedIssue(root, "zzzzzzzzzzzz")).toBeNull();
  });

  it("survives the search-index lag that makes remote dedup unreliable", () => {
    resolvePosted(root, "aaaaaaaaaaaa", 42);
    spool(root, report());
    expect(postedIssue(root, "aaaaaaaaaaaa")).toBe(42);
  });
});

describe("clearSpool", () => {
  it("removes every pending report", () => {
    spool(root, report({ fingerprint: "aaaaaaaaaaaa" }));
    spool(root, report({ fingerprint: "bbbbbbbbbbbb" }));
    clearSpool(root);
    expect(pending(root)).toHaveLength(0);
  });

  it("leaves the posted map intact so dedup still holds", () => {
    resolvePosted(root, "aaaaaaaaaaaa", 42);
    clearSpool(root);
    expect(postedIssue(root, "aaaaaaaaaaaa")).toBe(42);
  });
});

describe("reportHome", () => {
  it("defaults under the user's home directory", () => {
    expect(reportHome({ HOME: "/Users/alice" })).toBe("/Users/alice/.ymir");
  });

  it("honours YMIR_HOME", () => {
    expect(reportHome({ HOME: "/Users/alice", YMIR_HOME: "/tmp/y" })).toBe("/tmp/y");
  });
});

describe("flush window", () => {
  it("is due when never flushed", () => {
    expect(loadConfig(root, {}).lastFlushAt).toBeUndefined();
  });

  it("records the flush time", () => {
    saveConfig(root, { lastFlushAt: "2026-08-21T00:00:00.000Z" });
    expect(loadConfig(root, {}).lastFlushAt).toBe("2026-08-21T00:00:00.000Z");
  });

  it("preserves other fields when patching one", () => {
    saveConfig(root, { mode: "auto", repo: "acme/x" });
    saveConfig(root, { lastFlushAt: "2026-08-21T00:00:00.000Z" });

    const cfg = loadConfig(root, {});
    expect(cfg.mode).toBe("auto");
    expect(cfg.repo).toBe("acme/x");
  });
});
