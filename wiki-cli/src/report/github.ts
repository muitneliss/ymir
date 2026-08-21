import { spawnSync } from "node:child_process";
import { redact, truncate } from "./redact.js";
import type { Report } from "./model.js";

/**
 * Delivery of a report to a GitHub issue tracker.
 *
 * Ymir runs on other people's machines, so it has no credentials of its own and
 * must not ship any. It borrows the user's `gh` login instead: the issue is
 * filed by them, visibly, with nothing to leak if the binary is inspected. When
 * `gh` is missing or logged out there is no silent failure either — the report
 * comes back as a prefilled URL the user can open.
 *
 * Like `reindex.ts`, every path here degrades instead of throwing: a report that
 * cannot be delivered is not worth failing a command over.
 */

export interface RunnerResult {
  status: number | null;
  stdout: string;
}

export type GhRunner = (args: string[]) => RunnerResult;

export type PostOutcome = "created" | "commented" | "fallback-url" | "failed";

export interface PostResult {
  outcome: PostOutcome;
  issue?: number;
  url?: string;
}

export interface PostOptions {
  repo: string;
  run?: GhRunner;
  /** Locally known fingerprint → issue mapping, consulted before any search. */
  postedIssue: (fingerprint: string) => number | null;
}

const LABEL = "self-report";
const BODY_LIMIT = 12_000;
const MESSAGE_LIMIT = 2_000;
const STACK_LIMIT = 2_000;

/** Browsers and servers both start refusing somewhere past 8k. */
const URL_LIMIT = 8_000;

const KIND_HEADING: Record<Report["kind"], string> = {
  "cli-error": "CLI error",
  skill: "Skill-flow failure",
  hook: "Plugin hook failure",
  feedback: "Feedback",
};

const defaultRunner: GhRunner = (args) => {
  const result = spawnSync("gh", args, { stdio: "pipe", encoding: "utf8", timeout: 20_000 });
  return { status: result.status, stdout: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

export function renderTitle(report: Report): string {
  const summary = redact(report.message).split("\n")[0]!.trim();
  const prefix = report.kind === "feedback" ? "feedback" : `${report.command}: ${report.errorName}`;
  return truncate(`[self-report] ${prefix} — ${summary}`, 120);
}

/**
 * The issue body.
 *
 * Redacts a second time even though the report was redacted when captured: this
 * is the last point before the text becomes public and permanent, and the cost
 * of the duplicate pass is nothing next to the cost of being wrong once.
 */
export function renderBody(report: Report): string {
  const message = truncate(redact(report.message), MESSAGE_LIMIT, 40);
  const stack = report.stack ? truncate(redact(report.stack), STACK_LIMIT, 12) : null;

  const lines = [
    `**${KIND_HEADING[report.kind]}** — filed automatically by Ymir's self-report.`,
    "",
    "| | |",
    "|---|---|",
    `| Command | \`${report.command}\` |`,
    `| Error | \`${report.errorName}\` |`,
    `| Ymir version | \`${report.version}\` |`,
    `| Platform | \`${report.platform}\` |`,
    `| Occurrences | ${report.occurrences} |`,
    `| First seen | ${report.firstSeen} |`,
    `| Last seen | ${report.lastSeen} |`,
    "",
    "### Message",
    "",
    "```",
    message,
    "```",
  ];

  if (report.flags?.length) {
    lines.push("", `### Flags`, "", report.flags.map((f) => `\`${f}\``).join(", "));
  }

  if (stack) lines.push("", "### Stack", "", "```", stack, "```");

  lines.push(
    "",
    "---",
    "",
    `Fingerprint \`${report.fingerprint}\` — recurrences are added as comments here.`,
    "Paths, hostnames, credentials and identities were stripped before sending.",
    "Opt out with `wiki report --off`, `YMIR_REPORT=off`, or `DO_NOT_TRACK=1`.",
  );

  return truncate(lines.join("\n"), BODY_LIMIT);
}

export function fallbackUrl(report: Report, repo: string): string {
  const title = encodeURIComponent(renderTitle(report));
  const base = `https://github.com/${repo}/issues/new?labels=${LABEL}&title=${title}&body=`;

  let budget = URL_LIMIT - base.length;
  let body = renderBody(report);
  let encoded = encodeURIComponent(body);

  // Percent-encoding expands unpredictably, so shrink the source until it fits.
  while (encoded.length > budget && body.length > 200) {
    body = truncate(body, Math.floor(body.length * 0.7));
    encoded = encodeURIComponent(body);
  }

  return base + encoded.slice(0, Math.max(0, budget));
}

function ghAvailable(run: GhRunner): boolean {
  const result = run(["auth", "status"]);
  return result.status === 0;
}

/** An issue for this fingerprint filed from some other machine. */
function findRemote(run: GhRunner, repo: string, fingerprint: string): number | null {
  const result = run([
    "issue",
    "list",
    "--repo",
    repo,
    "--search",
    `${fingerprint} in:body`,
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number,state",
  ]);
  if (result.status !== 0) return null;

  try {
    const rows = JSON.parse(result.stdout) as { number: number }[];
    return rows[0]?.number ?? null;
  } catch {
    return null;
  }
}

function issueNumberFrom(stdout: string): number | null {
  const match = stdout.trim().match(/\/issues\/(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

/**
 * File a new issue, retrying unlabelled if the destination has no `self-report`
 * label — a fork will not, and losing the label is a far better outcome than
 * losing the report.
 */
function createIssue(run: GhRunner, repo: string, report: Report): PostResult {
  const base = ["issue", "create", "--repo", repo, "--title", renderTitle(report), "--body", renderBody(report)];

  let result = run([...base, "--label", LABEL]);
  if (result.status !== 0 && /label/i.test(result.stdout)) result = run(base);

  if (result.status !== 0) return { outcome: "failed" };

  const issue = issueNumberFrom(result.stdout);
  return issue === null ? { outcome: "failed" } : { outcome: "created", issue };
}

function commentRecurrence(run: GhRunner, repo: string, report: Report, issue: number): PostResult {
  const body = [
    `Seen again on Ymir \`${report.version}\` (\`${report.platform}\`) — ${report.occurrences} occurrence(s) as of ${report.lastSeen}.`,
    "",
    "```",
    truncate(redact(report.message), MESSAGE_LIMIT, 20),
    "```",
  ].join("\n");

  const result = run(["issue", "comment", String(issue), "--repo", repo, "--body", body]);
  return result.status === 0 ? { outcome: "commented", issue } : { outcome: "failed", issue };
}

export function postReport(report: Report, options: PostOptions): PostResult {
  const run = options.run ?? defaultRunner;

  try {
    if (!ghAvailable(run)) {
      return { outcome: "fallback-url", url: fallbackUrl(report, options.repo) };
    }

    const known = options.postedIssue(report.fingerprint) ?? findRemote(run, options.repo, report.fingerprint);
    if (known !== null) return commentRecurrence(run, options.repo, report, known);

    return createIssue(run, options.repo, report);
  } catch {
    return { outcome: "failed" };
  }
}
