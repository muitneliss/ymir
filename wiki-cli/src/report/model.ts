import { sha256Hex } from "../hash.js";

export type ReportKind = "cli-error" | "skill" | "hook" | "feedback";

/** What a caller knows at the moment something goes wrong. */
export interface ReportDraft {
  kind: ReportKind;
  /** Subcommand only — never argument values, which carry user data. */
  command: string;
  errorName: string;
  message: string;
  stack?: string;
  /** Flag names only, for the same reason as `command`. */
  flags?: string[];
}

/** A draft plus the identity and environment the reporter adds. */
export interface Report extends ReportDraft {
  schema: 1;
  fingerprint: string;
  version: string;
  platform: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
}

/**
 * A stable identity for "this same bug", used to merge recurrences locally and
 * to find an already-filed issue upstream.
 *
 * Deliberately excludes the stack. Ymir ships as a `bun build --compile`
 * binary, and that artifact emits no usable frames at all — a fingerprint over
 * frames would be empty in exactly the builds real users run, while still
 * differing between a maintainer's dev checkout and everyone else.
 *
 * Runs of digits collapse so that counts, line numbers and sizes ("after 3
 * pages" vs "after 47 pages") do not split one bug across dozens of issues.
 */
export function fingerprint(draft: ReportDraft): string {
  const normalized = draft.message.trim().toLowerCase().replace(/\d+/g, "N");
  return sha256Hex([draft.kind, draft.command, draft.errorName, normalized].join("\0")).slice(0, 12);
}
