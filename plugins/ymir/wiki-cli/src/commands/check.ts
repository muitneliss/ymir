import { runCheck, type CheckFinding } from "../check.js";

export interface CheckCmdInput {
  root: string;
  json: boolean;
  errorOnOrphanNotes: boolean;
  errorOnUntrackedSources: boolean;
}

export interface CheckCmdOutput {
  text: string;
  exitCode: number;
}

function formatFinding(prefix: string, f: CheckFinding): string {
  const loc = f.path ? ` ${f.path}` : "";
  const remedy = f.remedy ? `\n  remedy: ${f.remedy}` : "";
  return `${prefix}:${loc}: ${f.message}${remedy}`;
}

export function runCheckCmd(i: CheckCmdInput): CheckCmdOutput {
  const report = runCheck({
    root: i.root,
    errorOnOrphanNotes: i.errorOnOrphanNotes,
    errorOnUntrackedSources: i.errorOnUntrackedSources,
  });

  if (i.json) {
    return { text: JSON.stringify(report, null, 2) + "\n", exitCode: report.ok ? 0 : 1 };
  }

  const lines: string[] = [];
  for (const e of report.errors) lines.push(formatFinding("error", e));
  for (const w of report.warnings) lines.push(formatFinding("warning", w));
  if (report.ok) lines.push("wiki ok");

  return { text: lines.join("\n") + "\n", exitCode: report.ok ? 0 : 1 };
}
