import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cli-boundary-home-"));
  project = mkdtempSync(join(tmpdir(), "cli-boundary-proj-"));
  mkdirSync(join(project, "wiki", "sources"), { recursive: true });
  mkdirSync(join(project, "wiki", "notes"), { recursive: true });
});

function runCli(args: string[], input = "", extraEnv: Record<string, string> = {}) {
  const result = spawnSync("bun", [CLI, ...args], {
    input,
    encoding: "utf8",
    cwd: project,
    env: { ...process.env, YMIR_HOME: home, ...extraEnv },
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

function spooled(): string[] {
  try {
    return readdirSync(join(home, "reports")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/**
 * A genuinely unexpected failure: `index` cannot write `index.md` because a
 * directory occupies the path. Unlike a bad flag, nothing in the CLI predicts
 * this — which is exactly the class the reporter exists for.
 */
function provokeCrash(): ReturnType<typeof runCli> {
  mkdirSync(join(project, "wiki", "index.md"), { recursive: true });
  return runCli(["--root", "./wiki", "index", "--no-reindex"]);
}

describe("cli error boundary", () => {
  it("formats a crash as an error line, never a raw stack dump", () => {
    const { stderr, status } = provokeCrash();

    expect(status).not.toBe(0);
    expect(stderr.startsWith("error:")).toBe(true);
    expect(stderr).not.toMatch(/^\s+at /m);
    expect(stderr).not.toContain("Bun v");
  });

  it("points the user at wiki report", () => {
    expect(provokeCrash().stderr).toContain("wiki report");
  });

  it("captures the crash so it can be filed", () => {
    provokeCrash();
    expect(spooled()).toHaveLength(1);
  });

  it("captures nothing when the user has opted out", () => {
    mkdirSync(join(project, "wiki", "index.md"), { recursive: true });
    runCli(["--root", "./wiki", "index", "--no-reindex"], "", { DO_NOT_TRACK: "1" });
    expect(spooled()).toHaveLength(0);
  });

  it("stays silent about reporting when opted out", () => {
    mkdirSync(join(project, "wiki", "index.md"), { recursive: true });
    const { stderr } = runCli(["--root", "./wiki", "index", "--no-reindex"], "", { DO_NOT_TRACK: "1" });

    expect(stderr).toContain("error:");
    expect(stderr).not.toContain("wiki report");
  });

  it("does not report ordinary user error — a bad flag is not a bug", () => {
    const { status } = runCli(["--root", "./wiki", "query", "--limit", "0", "x"]);
    expect(status).toBe(1);
    expect(spooled()).toHaveLength(0);
  });

  it("does not report a rejection — a broken link is a refusal, not a bug", () => {
    const { stderr, status } = runCli(
      ["--root", "./wiki", "note", "--type", "concept", "--name", "X", "--no-reindex"],
      "see [[Ghost]]",
    );

    expect(status).toBe(1);
    expect(stderr).toContain("broken link");
    expect(stderr).not.toContain("wiki report");
    expect(spooled()).toHaveLength(0);
  });

  it("does not report a slug collision either", () => {
    const write = ["--root", "./wiki", "note", "--type", "concept", "--no-reindex"];
    runCli([...write, "--name", "Hiệu trưởng"], "first");
    const { status } = runCli([...write, "--name", "Hiếu trường"], "second");

    expect(status).toBe(1);
    expect(spooled()).toHaveLength(0);
  });

  it("rejects an invalid --type as user error, not as a crash", () => {
    const { stderr, status } = runCli(
      ["--root", "./wiki", "note", "--type", "bogus", "--name", "P"],
      "body",
    );

    expect(status).toBe(1);
    expect(stderr).toContain("--type must be one of entity|concept|topic");
    expect(stderr).not.toContain("invalid_value");
    expect(spooled()).toHaveLength(0);
  });

  it("does not report an expected non-zero gate result", () => {
    const { status } = runCli(["--root", "./wiki", "status"]);
    expect(status).toBe(0);
    expect(spooled()).toHaveLength(0);
  });

  it("succeeds normally without touching the reporter", () => {
    const { status } = runCli(["--root", "./wiki", "index", "--no-reindex"]);
    expect(status).toBe(0);
    expect(spooled()).toHaveLength(0);
  });
});

describe("wiki --version", () => {
  it("reports a version instead of failing", () => {
    const { stdout, status } = runCli(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).not.toBe("");
  });
});

describe("wiki report via the CLI", () => {
  it("shows the captured crash", () => {
    provokeCrash();

    const { stdout, status } = runCli(["report"]);
    expect(status).toBe(0);
    expect(stdout).toContain("wiki index");
    expect(stdout).toContain("self-report");
  });

  it("--flush is silent when nothing is consented", () => {
    provokeCrash();

    const { stdout, status } = runCli(["report", "--flush"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("--off discards what was captured", () => {
    provokeCrash();
    expect(spooled()).toHaveLength(1);

    runCli(["report", "--off"]);
    expect(spooled()).toHaveLength(0);
  });

  it("--feedback captures without any failure having occurred", () => {
    const { status } = runCli(["report", "--feedback", "wish it had a dry run"]);
    expect(status).toBe(0);
    expect(spooled()).toHaveLength(1);
  });
});
