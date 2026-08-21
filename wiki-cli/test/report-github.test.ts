import { describe, it, expect } from "bun:test";
import { postReport, renderBody, renderTitle, type GhRunner } from "../src/report/github.js";
import type { Report } from "../src/report/model.js";

const REPO = "muitneliss/ymir";

function report(over: Partial<Report> = {}): Report {
  return {
    schema: 1,
    kind: "cli-error",
    fingerprint: "abc123def456",
    command: "wiki note",
    errorName: "ZodError",
    message: "Invalid option: expected one of entity|concept|topic",
    version: "0.7.0",
    platform: "darwin-arm64",
    firstSeen: "2026-08-21T00:00:00.000Z",
    lastSeen: "2026-08-21T00:00:00.000Z",
    occurrences: 1,
    ...over,
  };
}

/** Records every invocation and replies from a scripted table. */
function runnerFor(script: Record<string, { status: number; stdout: string }>) {
  const calls: string[][] = [];
  const run: GhRunner = (args) => {
    calls.push(args);
    for (const [key, reply] of Object.entries(script)) {
      if (args.join(" ").includes(key)) return reply;
    }
    return { status: 0, stdout: "" };
  };
  return { run, calls };
}

const GH_PRESENT = { "auth status": { status: 0, stdout: "Logged in" } };

describe("postReport — no usable gh", () => {
  it("falls back to a prefilled issue URL when gh is absent", () => {
    const run: GhRunner = () => ({ status: null, stdout: "" });
    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });

    expect(out.outcome).toBe("fallback-url");
    expect(out.url).toContain("https://github.com/muitneliss/ymir/issues/new");
    expect(out.url).toContain("title=");
    expect(out.url).toContain("body=");
  });

  it("falls back when gh is installed but unauthenticated", () => {
    const { run } = runnerFor({ "auth status": { status: 1, stdout: "not logged in" } });
    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });
    expect(out.outcome).toBe("fallback-url");
  });

  it("keeps the fallback URL inside a usable length", () => {
    const huge = report({ message: "x".repeat(50_000), stack: "y".repeat(50_000) });
    const run: GhRunner = () => ({ status: null, stdout: "" });
    const out = postReport(huge, { repo: REPO, run, postedIssue: () => null });
    expect(out.url!.length).toBeLessThanOrEqual(8000);
  });
});

describe("postReport — dedup", () => {
  it("comments on the known issue instead of filing a second one", () => {
    const { run, calls } = runnerFor(GH_PRESENT);
    const out = postReport(report({ occurrences: 4 }), {
      repo: REPO,
      run,
      postedIssue: () => 42,
    });

    expect(out.outcome).toBe("commented");
    expect(out.issue).toBe(42);

    const flat = calls.map((c) => c.join(" "));
    expect(flat.some((c) => c.startsWith("issue comment 42"))).toBe(true);
    expect(flat.some((c) => c.startsWith("issue create"))).toBe(false);
  });

  it("adopts an issue another machine already filed, found by fingerprint", () => {
    const { run, calls } = runnerFor({
      ...GH_PRESENT,
      "issue list": { status: 0, stdout: JSON.stringify([{ number: 7, state: "OPEN" }]) },
    });
    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });

    expect(out.outcome).toBe("commented");
    expect(out.issue).toBe(7);
    expect(calls.map((c) => c.join(" ")).some((c) => c.startsWith("issue create"))).toBe(false);
  });

  it("searches by fingerprint, scoped to the destination repo", () => {
    const { run, calls } = runnerFor({
      ...GH_PRESENT,
      "issue list": { status: 0, stdout: "[]" },
      "issue create": { status: 0, stdout: "https://github.com/muitneliss/ymir/issues/9\n" },
    });
    postReport(report(), { repo: REPO, run, postedIssue: () => null });

    const search = calls.find((c) => c.includes("list"))!.join(" ");
    expect(search).toContain("abc123def456");
    expect(search).toContain(REPO);
  });
});

describe("postReport — creating", () => {
  it("creates an issue and returns its number", () => {
    const { run } = runnerFor({
      ...GH_PRESENT,
      "issue list": { status: 0, stdout: "[]" },
      "issue create": { status: 0, stdout: "https://github.com/muitneliss/ymir/issues/123\n" },
    });
    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });

    expect(out.outcome).toBe("created");
    expect(out.issue).toBe(123);
  });

  it("retries without the label when the repo has no self-report label", () => {
    let attempt = 0;
    const run: GhRunner = (args) => {
      const joined = args.join(" ");
      if (joined.includes("auth status")) return { status: 0, stdout: "ok" };
      if (joined.includes("issue list")) return { status: 0, stdout: "[]" };
      if (joined.includes("issue create")) {
        attempt++;
        if (args.includes("--label")) {
          return { status: 1, stdout: "could not add label: 'self-report' not found" };
        }
        return { status: 0, stdout: "https://github.com/muitneliss/ymir/issues/5\n" };
      }
      return { status: 0, stdout: "" };
    };

    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });
    expect(attempt).toBe(2);
    expect(out.outcome).toBe("created");
    expect(out.issue).toBe(5);
  });

  it("reports failure rather than throwing when gh refuses outright", () => {
    const { run } = runnerFor({
      ...GH_PRESENT,
      "issue list": { status: 0, stdout: "[]" },
      "issue create": { status: 1, stdout: "HTTP 403 rate limited" },
    });
    const out = postReport(report(), { repo: REPO, run, postedIssue: () => null });
    expect(out.outcome).toBe("failed");
  });

  it("never throws even if the runner itself explodes", () => {
    const run: GhRunner = () => {
      throw new Error("spawn failed");
    };
    expect(() => postReport(report(), { repo: REPO, run, postedIssue: () => null })).not.toThrow();
  });
});

describe("issue rendering", () => {
  it("titles by command and short message, tagged for humans", () => {
    const title = renderTitle(report());
    expect(title).toContain("wiki note");
    expect(title).toContain("ZodError");
    expect(title.length).toBeLessThanOrEqual(120);
  });

  it("embeds the fingerprint so other machines can find this issue", () => {
    expect(renderBody(report())).toContain("abc123def456");
  });

  it("records environment a maintainer needs to reproduce", () => {
    const body = renderBody(report());
    expect(body).toContain("0.7.0");
    expect(body).toContain("darwin-arm64");
  });

  it("says how often it happened", () => {
    expect(renderBody(report({ occurrences: 12 }))).toContain("12");
  });

  it("marks the report as machine-filed so nobody mistakes it for a human", () => {
    expect(renderBody(report()).toLowerCase()).toContain("automatically");
  });

  it("redacts anything identifying that reached it late", () => {
    const body = renderBody(
      report({ message: "failed at /Users/alice/x.ts with gh" + "p_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" }),
    );
    expect(body).not.toContain("alice");
    expect(body).not.toContain("A1b2C3d4E5f6");
  });

  it("bounds the body regardless of input size", () => {
    const body = renderBody(report({ message: "x".repeat(100_000), stack: "y".repeat(100_000) }));
    expect(body.length).toBeLessThanOrEqual(12_000);
  });

  it("renders feedback as feedback, not as a crash", () => {
    const body = renderBody(report({ kind: "feedback", message: "wish it did X" }));
    expect(body).toContain("wish it did X");
    expect(body.toLowerCase()).toContain("feedback");
  });
});
