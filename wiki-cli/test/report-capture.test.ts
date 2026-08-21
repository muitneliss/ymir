import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { capture, draftFromError, flush, maybeFlush } from "../src/report.js";
import { loadConfig, pending, postedIssue, saveConfig, spool } from "../src/report/store.js";
import type { GhRunner } from "../src/report/github.js";
import type { Report } from "../src/report/model.js";

let home: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "report-capture-"));
  env = { YMIR_HOME: home, HOME: "/Users/alice" };
});

const okGh: GhRunner = (args) => {
  const joined = args.join(" ");
  if (joined.includes("auth status")) return { status: 0, stdout: "ok" };
  if (joined.includes("issue list")) return { status: 0, stdout: "[]" };
  if (joined.includes("issue create")) {
    return { status: 0, stdout: "https://github.com/muitneliss/ymir/issues/77\n" };
  }
  return { status: 0, stdout: "" };
};

describe("draftFromError", () => {
  it("names the error class and message", () => {
    const draft = draftFromError("wiki note", new TypeError("boom"));
    expect(draft.errorName).toBe("TypeError");
    expect(draft.message).toBe("boom");
    expect(draft.kind).toBe("cli-error");
  });

  it("copes with a thrown non-Error", () => {
    const draft = draftFromError("wiki note", "just a string");
    expect(draft.message).toContain("just a string");
    expect(draft.errorName).toBe("Error");
  });

  it("keeps flag names but never their values", () => {
    const draft = draftFromError("wiki note", new Error("x"), ["--type", "--name"]);
    expect(draft.flags).toEqual(["--type", "--name"]);
  });
});

describe("capture", () => {
  it("spools a report by default, without posting", () => {
    capture(draftFromError("wiki note", new Error("boom")), env);

    const all = pending(home);
    expect(all).toHaveLength(1);
    expect(all[0]!.command).toBe("wiki note");
    expect(all[0]!.occurrences).toBe(1);
  });

  it("redacts before storing — the spool itself must be safe to read", () => {
    capture(draftFromError("wiki note", new Error("failed at /Users/alice/secret/x.ts")), {
      ...env,
      YMIR_CWD: "/Users/alice/proj",
    });

    const stored = JSON.stringify(pending(home));
    expect(stored).not.toContain("alice");
  });

  it("fingerprints the same bug identically across users", () => {
    const alice = mkdtempSync(join(tmpdir(), "report-alice-"));
    const bob = mkdtempSync(join(tmpdir(), "report-bob-"));

    capture(draftFromError("wiki note", new Error("cannot read /Users/alice/proj/src/a.ts")), {
      YMIR_HOME: alice,
      YMIR_CWD: "/Users/alice/proj",
    });
    capture(draftFromError("wiki note", new Error("cannot read /home/bob/work/src/a.ts")), {
      YMIR_HOME: bob,
      YMIR_CWD: "/home/bob/work",
    });

    expect(pending(alice)[0]!.fingerprint).toBe(pending(bob)[0]!.fingerprint);
  });

  it("merges a repeat into one record with a count", () => {
    capture(draftFromError("wiki note", new Error("boom")), env);
    capture(draftFromError("wiki note", new Error("boom")), env);

    const all = pending(home);
    expect(all).toHaveLength(1);
    expect(all[0]!.occurrences).toBe(2);
  });

  it("captures nothing at all when the user has opted out", () => {
    capture(draftFromError("wiki note", new Error("boom")), { ...env, DO_NOT_TRACK: "1" });
    expect(pending(home)).toHaveLength(0);
  });

  it("never throws, whatever it is handed", () => {
    expect(() => capture(draftFromError("wiki note", new Error("boom")), { YMIR_HOME: "/" })).not.toThrow();
    expect(() => capture(draftFromError("x", { weird: true }), env)).not.toThrow();
  });
});

describe("flush", () => {
  function spoolOne(over: Partial<Report> = {}): void {
    capture(draftFromError("wiki note", new Error("boom")), env);
    if (Object.keys(over).length) {
      const existing = pending(home)[0]!;
      spool(home, { ...existing, ...over });
    }
  }

  it("posts nothing until the user opts in", () => {
    spoolOne();
    const summary = flush({ env, run: okGh });

    expect(summary.posted).toBe(0);
    expect(pending(home)).toHaveLength(1);
  });

  it("posts once opted in, and clears what it posted", () => {
    saveConfig(home, { mode: "auto" });
    spoolOne();

    const summary = flush({ env, run: okGh });
    expect(summary.posted).toBe(1);
    expect(pending(home)).toHaveLength(0);
    expect(postedIssue(home, summary.results[0]!.report.fingerprint)).toBe(77);
  });

  it("keeps a report spooled when posting fails, so it retries later", () => {
    saveConfig(home, { mode: "auto" });
    spoolOne();

    const failing: GhRunner = (args) =>
      args.join(" ").includes("auth status") ? { status: 0, stdout: "ok" } : { status: 1, stdout: "HTTP 500" };

    expect(flush({ env, run: failing }).posted).toBe(0);
    expect(pending(home)).toHaveLength(1);
  });

  it("does not treat a fallback URL as delivered", () => {
    saveConfig(home, { mode: "auto" });
    spoolOne();

    const noGh: GhRunner = () => ({ status: null, stdout: "" });
    const summary = flush({ env, run: noGh });

    expect(summary.posted).toBe(0);
    expect(summary.results[0]!.result.outcome).toBe("fallback-url");
    expect(pending(home)).toHaveLength(1);
  });

  it("is a silent no-op with an empty spool", () => {
    saveConfig(home, { mode: "auto" });
    expect(flush({ env, run: okGh }).results).toHaveLength(0);
  });
});

describe("maybeFlush", () => {
  it("does nothing when the spool is empty", () => {
    saveConfig(home, { mode: "auto" });
    let called = false;
    maybeFlush({ env, run: (a) => ((called = true), { status: 0, stdout: "" }) });
    expect(called).toBe(false);
  });

  it("does nothing when the user has not opted in", () => {
    capture(draftFromError("wiki note", new Error("boom")), env);
    let called = false;
    maybeFlush({ env, run: (a) => ((called = true), { status: 0, stdout: "" }) });
    expect(called).toBe(false);
  });

  it("flushes when opted in with work pending, and records the time", () => {
    saveConfig(home, { mode: "auto" });
    capture(draftFromError("wiki note", new Error("boom")), env);

    maybeFlush({ env, run: okGh });

    expect(pending(home)).toHaveLength(0);
    expect(loadConfig(home, {}).lastFlushAt).toBeDefined();
  });

  it("holds off inside the rate-limit window", () => {
    saveConfig(home, { mode: "auto", lastFlushAt: new Date().toISOString() });
    capture(draftFromError("wiki note", new Error("boom")), env);

    let called = false;
    maybeFlush({ env, run: (a) => ((called = true), { status: 0, stdout: "" }) });
    expect(called).toBe(false);
    expect(pending(home)).toHaveLength(1);
  });

  it("flushes again once the window has passed", () => {
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    saveConfig(home, { mode: "auto", lastFlushAt: old });
    capture(draftFromError("wiki note", new Error("boom")), env);

    maybeFlush({ env, run: okGh });
    expect(pending(home)).toHaveLength(0);
  });

  it("never throws, even if delivery explodes", () => {
    saveConfig(home, { mode: "auto" });
    capture(draftFromError("wiki note", new Error("boom")), env);

    expect(() =>
      maybeFlush({
        env,
        run: () => {
          throw new Error("spawn failed");
        },
      }),
    ).not.toThrow();
  });
});
