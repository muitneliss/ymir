import { capture, flush } from "../report.js";
import { renderBody, renderTitle, type GhRunner } from "../report/github.js";
import { clearSpool, loadConfig, pending, reportHome, saveConfig, type Env } from "../report/store.js";

export interface ReportInput {
  env?: Env;
  run?: GhRunner;
  /** Consent and send now — the one-time opt-in. */
  yes?: boolean;
  /** Send if already consented; say nothing otherwise. */
  flush?: boolean;
  skill?: { title: string; detail: string };
  feedback?: string;
  off?: boolean;
}

export interface ReportOutput {
  text: string;
  exitCode: number;
}

/**
 * `wiki report` — review, file, and opt in or out of self-reporting.
 *
 * With no flags it is a preview, never a send. A user's first contact with this
 * feature is a crash hint, and the honest thing to show them next is the exact
 * text that would become a public issue, before anything leaves the machine.
 */
export function runReport(input: ReportInput): ReportOutput {
  const env = input.env ?? process.env;
  const root = reportHome(env);

  if (input.off) return optOut(root);
  if (input.skill) return captureSkill(root, env, input.skill);
  if (input.feedback !== undefined) return captureFeedback(root, env, input.feedback);
  if (input.flush) return flushQuietly(input);

  return input.yes ? consentAndSend(root, env, input) : preview(root, env);
}

function optOut(root: string): ReportOutput {
  saveConfig(root, { mode: "off" });
  clearSpool(root);
  return {
    text: "self-report is off. Nothing further will be captured or sent.\nRe-enable with `wiki report --yes`.\n",
    exitCode: 0,
  };
}

function captureSkill(root: string, env: Env, skill: { title: string; detail: string }): ReportOutput {
  if (skill.title.trim() === "") {
    return { text: "error: --title is required with --skill\n", exitCode: 1 };
  }

  capture(
    {
      kind: "skill",
      command: "ymir skill",
      errorName: "SkillFlowFailure",
      message: `${skill.title.trim()}\n\n${skill.detail.trim()}`,
    },
    env,
  );

  return { text: capturedText(root, env), exitCode: 0 };
}

function captureFeedback(root: string, env: Env, feedback: string): ReportOutput {
  if (feedback.trim() === "") {
    return { text: "error: --feedback needs some text\n", exitCode: 1 };
  }

  capture(
    { kind: "feedback", command: "ymir feedback", errorName: "Feedback", message: feedback.trim() },
    env,
  );

  return { text: capturedText(root, env), exitCode: 0 };
}

/** Whether the note just captured will go out on its own, or needs a nudge. */
function capturedText(root: string, env: Env): string {
  const consented = loadConfig(root, env).mode === "auto";
  return consented
    ? "captured — it will be filed on the next run.\n"
    : "captured locally. Review it with `wiki report`, then send with `wiki report --yes`.\n";
}

/** The opportunistic and hook-driven path: succeed silently or say nothing. */
function flushQuietly(input: ReportInput): ReportOutput {
  flush({ env: input.env, run: input.run });
  return { text: "", exitCode: 0 };
}

function preview(root: string, env: Env): ReportOutput {
  const config = loadConfig(root, env);
  const reports = pending(root);

  if (reports.length === 0) return { text: "nothing to report — no failures captured.\n", exitCode: 0 };

  const lines = [
    `${reports.length} report(s) pending, destined for ${config.repo}:`,
    "",
  ];

  for (const report of reports) {
    lines.push(`── ${renderTitle(report)}`, "", renderBody(report), "");
  }

  lines.push(
    config.mode === "auto"
      ? "You have opted in — these are filed automatically. `wiki report --off` to stop."
      : "Nothing has been sent. `wiki report --yes` files these and opts you in; `wiki report --off` discards them.",
  );

  return { text: lines.join("\n") + "\n", exitCode: 0 };
}

function consentAndSend(root: string, env: Env, input: ReportInput): ReportOutput {
  if (loadConfig(root, env).mode === "off") {
    return {
      text: "self-report is opted out via DO_NOT_TRACK, DISABLE_TELEMETRY, or YMIR_REPORT=off.\nUnset it to send reports.\n",
      exitCode: 0,
    };
  }

  saveConfig(root, { mode: "auto" });

  const summary = flush({ env, run: input.run });
  if (summary.results.length === 0) return { text: "opted in. Nothing pending to send.\n", exitCode: 0 };

  const config = loadConfig(root, env);
  const lines: string[] = [];

  for (const { result } of summary.results) {
    if (result.outcome === "created") lines.push(`filed https://github.com/${config.repo}/issues/${result.issue}`);
    else if (result.outcome === "commented") {
      lines.push(`added to https://github.com/${config.repo}/issues/${result.issue}`);
    } else if (result.outcome === "fallback-url") {
      lines.push("gh is unavailable — open this to file it yourself:", result.url ?? "");
    } else lines.push("could not reach GitHub — kept locally, will retry.");
  }

  lines.push("", "Opted in: future reports are filed automatically. `wiki report --off` to stop.");
  return { text: lines.join("\n") + "\n", exitCode: 0 };
}
