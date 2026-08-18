import { computeStatus, hasDrift } from "../status.js";

export interface StatusInput {
  root: string;
  json: boolean;
}

export interface StatusOutput {
  text: string;
  exitCode: number;
}

export function runStatus(i: StatusInput): StatusOutput {
  const report = computeStatus(i.root);
  const drift = hasDrift(report);

  if (i.json) {
    return { text: JSON.stringify(report, null, 2) + "\n", exitCode: drift ? 1 : 0 };
  }

  const lines: string[] = [];

  const stale = report.sources.filter((s) => s.state === "stale");
  const missing = report.sources.filter((s) => s.state === "missing");
  const current = report.sources.filter((s) => s.state === "current");
  const untracked = report.sources.filter((s) => s.state === "untracked");

  if (stale.length > 0) {
    lines.push("stale:");
    for (const s of stale) lines.push(`  ${s.title}  ← ${s.source_path} (changed)`);
  }
  if (missing.length > 0) {
    lines.push("missing:");
    for (const s of missing) lines.push(`  ${s.title}  ← ${s.source_path ?? "(unknown)"} (not found)`);
  }
  if (report.review.length > 0) {
    lines.push("review (linked to stale/missing):");
    for (const n of report.review) lines.push(`  ${n.title}`);
  }
  if (current.length > 0) {
    lines.push("current:");
    for (const s of current) lines.push(`  ${s.title}`);
  }
  if (untracked.length > 0) {
    lines.push("untracked:");
    for (const s of untracked) lines.push(`  ${s.title}`);
  }

  if (lines.length === 0) lines.push("wiki up to date");

  return { text: lines.join("\n") + "\n", exitCode: drift ? 1 : 0 };
}
