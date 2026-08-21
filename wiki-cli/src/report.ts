import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprint, type Report, type ReportDraft } from "./report/model.js";
import { redact, truncate } from "./report/redact.js";
import { postReport, type GhRunner, type PostResult } from "./report/github.js";
import {
  loadConfig,
  pending,
  postedIssue,
  reportHome,
  resolvePosted,
  saveConfig,
  spool,
  type Env,
} from "./report/store.js";

/**
 * Ymir's self-report: turn a failure on a user's machine into an issue the
 * maintainers can act on.
 *
 * The split that matters is capture from delivery. Capture runs on the error
 * path and only ever touches the local disk — a crashing CLI must not also wait
 * on a network call. Delivery happens later, from `wiki report` or the
 * opportunistic flush, where being slow is merely slow.
 */

export const REPORT_HINT =
  "[ymir] That looks like a bug in Ymir. Run `wiki report` to review it and file it upstream (`--off` to disable).";

/** How long the opportunistic flush waits before trying again. */
const FLUSH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const MESSAGE_LIMIT = 4_000;
const STACK_LIMIT = 4_000;

export interface FlushOptions {
  env?: Env;
  run?: GhRunner;
}

export interface FlushSummary {
  posted: number;
  results: { report: Report; result: PostResult }[];
}

/**
 * The Ymir version that produced this report.
 *
 * Read from the `.version` stamp `ensure-wiki-binary.mjs` writes beside the
 * executable, so the version a report claims is the one that was actually
 * installed — the compiled binary carries no version of its own, and inventing a
 * second source for it would just create something new to drift.
 */
function resolveVersion(): string {
  try {
    return readFileSync(join(dirname(process.execPath), ".version"), "utf8").trim() || "dev";
  } catch {
    return "dev";
  }
}

export function draftFromError(command: string, error: unknown, flags?: string[]): ReportDraft {
  const isError = error instanceof Error;
  return {
    kind: "cli-error",
    command,
    errorName: isError ? error.name : "Error",
    message: isError ? error.message : String(error),
    stack: isError ? error.stack : undefined,
    flags,
  };
}

/**
 * Record a report locally.
 *
 * Redaction happens here, before the fingerprint is computed, and that ordering
 * is load-bearing twice over. It keeps the on-disk spool safe to read, and it
 * makes one bug fingerprint identically on every machine — fingerprinting the
 * raw message would fold each user's home directory into the identity, so the
 * same crash would arrive as a fresh issue from every person who hit it.
 */
export function capture(draft: ReportDraft, env: Env = process.env): Report | null {
  try {
    const root = reportHome(env);
    if (loadConfig(root, env).mode === "off") return null;

    const ctx = { cwd: env.YMIR_CWD ?? process.cwd() };
    const clean: ReportDraft = {
      ...draft,
      message: truncate(redact(draft.message, ctx), MESSAGE_LIMIT, 40),
      stack: draft.stack ? truncate(redact(draft.stack, ctx), STACK_LIMIT, 12) : undefined,
    };

    const now = new Date().toISOString();
    const report: Report = {
      ...clean,
      schema: 1,
      fingerprint: fingerprint(clean),
      version: resolveVersion(),
      platform: `${process.platform}-${process.arch}`,
      firstSeen: now,
      lastSeen: now,
      occurrences: 1,
    };

    spool(root, report);
    return report;
  } catch {
    return null;
  }
}

/**
 * Deliver every pending report.
 *
 * A report is dropped only once it is genuinely filed. A failed post — or a
 * fallback URL, which nobody has opened yet — leaves it spooled so the next
 * flush tries again.
 */
export function flush(options: FlushOptions = {}): FlushSummary {
  const env = options.env ?? process.env;
  const root = reportHome(env);
  const config = loadConfig(root, env);

  const summary: FlushSummary = { posted: 0, results: [] };
  if (config.mode !== "auto") return summary;

  for (const report of pending(root)) {
    const result = postReport(report, {
      repo: config.repo,
      run: options.run,
      postedIssue: (fp) => postedIssue(root, fp),
    });

    summary.results.push({ report, result });

    if ((result.outcome === "created" || result.outcome === "commented") && result.issue !== undefined) {
      resolvePosted(root, report.fingerprint, result.issue);
      summary.posted++;
    }
  }

  return summary;
}

/**
 * Deliver pending reports from an ordinary command, if it is cheap and welcome.
 *
 * This is what makes reporting automatic without a background process or a
 * Claude-Code-only hook — the latter would never fire for `skills add` installs
 * on other agents. The gates are ordered cheapest first, so the overwhelmingly
 * common case (nothing to send) costs a single directory read, and it can never
 * change the host command's output or exit code.
 */
export function maybeFlush(options: FlushOptions = {}): void {
  try {
    const env = options.env ?? process.env;
    const root = reportHome(env);

    const config = loadConfig(root, env);
    if (config.mode !== "auto") return;
    if (pending(root).length === 0) return;

    if (config.lastFlushAt) {
      const since = Date.now() - Date.parse(config.lastFlushAt);
      if (Number.isFinite(since) && since < FLUSH_INTERVAL_MS) return;
    }

    saveConfig(root, { lastFlushAt: new Date().toISOString() });
    flush(options);
  } catch {
    /* Reporting must never be why a working command failed. */
  }
}
