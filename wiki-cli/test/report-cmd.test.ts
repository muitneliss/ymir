import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runReport } from "../src/commands/report.js";
import { capture, draftFromError } from "../src/report.js";
import { loadConfig, pending, saveConfig } from "../src/report/store.js";
import type { GhRunner } from "../src/report/github.js";

let home: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "report-cmd-"));
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

const noGh: GhRunner = () => ({ status: null, stdout: "" });

function spoolOne(): void {
  capture(draftFromError("wiki note", new Error("boom")), env);
}

describe("wiki report — listing", () => {
  it("says so when there is nothing to report", () => {
    const { text, exitCode } = runReport({ env, run: okGh });
    expect(exitCode).toBe(0);
    expect(text).toContain("nothing to report");
  });

  it("previews the exact body that would be posted, and does not post it", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env, run: okGh });

    expect(exitCode).toBe(0);
    expect(text).toContain("wiki note");
    expect(text).toContain("self-report");
    expect(pending(home)).toHaveLength(1);
  });

  it("tells an un-consented user how to opt in", () => {
    spoolOne();
    expect(runReport({ env, run: okGh }).text).toContain("--yes");
  });

  it("names the destination repo so a fork is not a surprise", () => {
    spoolOne();
    expect(runReport({ env, run: okGh }).text).toContain("muitneliss/ymir");
  });
});

describe("wiki report --yes", () => {
  it("records consent and posts", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env, run: okGh, yes: true });

    expect(exitCode).toBe(0);
    expect(loadConfig(home, {}).mode).toBe("auto");
    expect(pending(home)).toHaveLength(0);
    expect(text).toContain("77");
  });

  it("prints a usable URL when gh cannot deliver", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env, run: noGh, yes: true });

    expect(exitCode).toBe(0);
    expect(text).toContain("https://github.com/muitneliss/ymir/issues/new");
    expect(pending(home)).toHaveLength(1);
  });

  it("refuses to post when the user has a hard opt-out set", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env: { ...env, DO_NOT_TRACK: "1" }, run: okGh, yes: true });

    expect(exitCode).toBe(0);
    expect(text.toLowerCase()).toContain("opted out");
  });
});

describe("wiki report --flush", () => {
  it("is silent and successful with nothing pending", () => {
    saveConfig(home, { mode: "auto" });
    const { text, exitCode } = runReport({ env, run: okGh, flush: true });
    expect(exitCode).toBe(0);
    expect(text).toBe("");
  });

  it("is silent when not consented, and posts nothing", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env, run: okGh, flush: true });

    expect(exitCode).toBe(0);
    expect(text).toBe("");
    expect(pending(home)).toHaveLength(1);
  });

  it("posts when consented", () => {
    saveConfig(home, { mode: "auto" });
    spoolOne();

    const { exitCode } = runReport({ env, run: okGh, flush: true });
    expect(exitCode).toBe(0);
    expect(pending(home)).toHaveLength(0);
  });
});

describe("wiki report --skill", () => {
  it("captures a skill-flow failure Claude could never surface from the CLI", () => {
    const { exitCode } = runReport({
      env,
      run: okGh,
      skill: { title: "apply wrote no files", detail: "playbook Target line was missing" },
    });

    expect(exitCode).toBe(0);
    const all = pending(home);
    expect(all).toHaveLength(1);
    expect(all[0]!.kind).toBe("skill");
    expect(all[0]!.message).toContain("playbook Target line was missing");
  });

  it("requires a title", () => {
    const { exitCode, text } = runReport({ env, run: okGh, skill: { title: "", detail: "x" } });
    expect(exitCode).toBe(1);
    expect(text).toContain("--title");
  });
});

describe("wiki report --feedback", () => {
  it("captures an improvement idea through the same pipeline", () => {
    const { exitCode } = runReport({ env, run: okGh, feedback: "wish ymir apply had a --dry-run" });

    expect(exitCode).toBe(0);
    const all = pending(home);
    expect(all[0]!.kind).toBe("feedback");
    expect(all[0]!.message).toContain("--dry-run");
  });

  it("redacts feedback too — users paste logs into it", () => {
    runReport({ env, run: okGh, feedback: "broke on /Users/alice/proj/a.ts" });
    expect(JSON.stringify(pending(home))).not.toContain("alice");
  });

  it("rejects empty feedback", () => {
    expect(runReport({ env, run: okGh, feedback: "   " }).exitCode).toBe(1);
  });
});

describe("wiki report --off", () => {
  it("opts out, and forgets everything already captured", () => {
    spoolOne();
    const { text, exitCode } = runReport({ env, run: okGh, off: true });

    expect(exitCode).toBe(0);
    expect(loadConfig(home, {}).mode).toBe("off");
    expect(pending(home)).toHaveLength(0);
    expect(text.toLowerCase()).toContain("off");
  });

  it("stops later captures from being stored at all", () => {
    runReport({ env, run: okGh, off: true });
    capture(draftFromError("wiki note", new Error("boom")), env);
    expect(pending(home)).toHaveLength(0);
  });
});
