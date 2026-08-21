import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, type Report, type ReportDraft } from "./model.js";

/**
 * Persistent report state, in `~/.ymir`.
 *
 * Two rules govern every function here. First, **nothing throws**: this state is
 * touched from the CLI's error path, and a reporter that crashes while reporting
 * a crash is worse than no reporter. Every read tolerates corruption by
 * discarding it, and every write gives up silently. Second, state is **global,
 * not per-project** — consent is a statement about the person, not the
 * repository, so answering once covers every project on the machine.
 */

export type ConsentMode =
  /** Explicit opt-out. Capture nothing, keep nothing, send nothing. */
  | "off"
  /** Default. Capture locally so `wiki report` has something to show; send nothing. */
  | "unset"
  /** Opted in. Capture and send. */
  | "auto";

export interface ReportConfig {
  mode: ConsentMode;
  repo: string;
  lastFlushAt?: string;
}

export const DEFAULT_REPO = "muitneliss/ymir";

/** Bounded so an unattended crash loop cannot fill a user's disk. */
export const SPOOL_LIMIT = 50;

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export type Env = Record<string, string | undefined>;

export function reportHome(env: Env): string {
  return env.YMIR_HOME ?? join(env.HOME ?? env.USERPROFILE ?? ".", ".ymir");
}

const spoolDir = (root: string): string => join(root, "reports");
const incomingDir = (root: string): string => join(spoolDir(root), "incoming");
const configPath = (root: string): string => join(root, "config.json");
const postedPath = (root: string): string => join(root, "posted.json");

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  } catch {
    /* A machine that cannot store a report still has to run the command. */
  }
}

/** `1` and `true` opt out; `0` must not, or the flag becomes impossible to unset. */
function isTruthy(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";
}

/**
 * Effective config: environment beats the stored file, and a global opt-out
 * beats everything. `DO_NOT_TRACK` / `DISABLE_TELEMETRY` are honoured because
 * Ymir's own README already promises them for the skills CLI, and a user who
 * sets one does not expect a second, separate channel to keep reporting.
 */
export function loadConfig(root: string, env: Env): ReportConfig {
  const stored = readJson<Partial<ReportConfig>>(configPath(root)) ?? {};

  const optedOut = isTruthy(env.DO_NOT_TRACK) || isTruthy(env.DISABLE_TELEMETRY);
  const fromEnv = env.YMIR_REPORT;

  let mode: ConsentMode = stored.mode === "auto" || stored.mode === "off" ? stored.mode : "unset";
  if (fromEnv === "off" || fromEnv === "auto" || fromEnv === "unset") mode = fromEnv;
  if (optedOut) mode = "off";

  const candidate = env.YMIR_REPORT_REPO ?? stored.repo;
  const repo = candidate && REPO_PATTERN.test(candidate) ? candidate : DEFAULT_REPO;

  return { mode, repo, lastFlushAt: stored.lastFlushAt };
}

export function saveConfig(root: string, patch: Partial<ReportConfig>): void {
  const stored = readJson<Partial<ReportConfig>>(configPath(root)) ?? {};
  writeJson(configPath(root), { ...stored, ...patch });
}

/**
 * Record a report, merging it into any existing one with the same fingerprint.
 *
 * Merging here — rather than at post time — is what keeps a crash loop from
 * turning into fifty issues: by the time anything is sent, one bug is already
 * one record carrying a count.
 */
export function spool(root: string, report: Report): void {
  const existing = readJson<Report>(join(spoolDir(root), `${report.fingerprint}.json`));

  const merged: Report = existing
    ? {
        ...report,
        firstSeen: existing.firstSeen,
        lastSeen: report.lastSeen,
        occurrences: existing.occurrences + report.occurrences,
      }
    : report;

  writeJson(join(spoolDir(root), `${merged.fingerprint}.json`), merged);
  evictOverflow(root);
}

function evictOverflow(root: string): void {
  const all = readSpool(root);
  if (all.length <= SPOOL_LIMIT) return;

  const doomed = all.sort((a, b) => a.lastSeen.localeCompare(b.lastSeen)).slice(0, all.length - SPOOL_LIMIT);
  for (const report of doomed) drop(root, report.fingerprint);
}

function readSpool(root: string): Report[] {
  let names: string[];
  try {
    names = readdirSync(spoolDir(root));
  } catch {
    return [];
  }

  const out: Report[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const report = readJson<Report>(join(spoolDir(root), name));
    if (report?.fingerprint && report.lastSeen) out.push(report);
  }
  return out;
}

/**
 * Adopt records left by the plugin hooks.
 *
 * A `.mjs` hook cannot import this module, and hand-copying the reporting logic
 * into it would repeat the drift the repo already suffers between `platform.ts`
 * and its inline copy. So hooks append one JSON object per line and the CLI
 * completes them here — the hook's whole obligation is an append.
 */
function adoptIncoming(root: string): Report[] {
  let names: string[];
  try {
    names = readdirSync(incomingDir(root));
  } catch {
    return [];
  }

  const adopted: Report[] = [];
  for (const name of names) {
    let lines: string[];
    try {
      lines = readFileSync(join(incomingDir(root), name), "utf8").split("\n");
    } catch {
      continue;
    }

    for (const line of lines) {
      if (line.trim() === "") continue;
      let draft: ReportDraft & Partial<Report>;
      try {
        draft = JSON.parse(line);
      } catch {
        continue;
      }
      if (!draft.kind || !draft.command || typeof draft.message !== "string") continue;

      const now = draft.lastSeen ?? new Date().toISOString();
      adopted.push({
        schema: 1,
        kind: draft.kind,
        command: draft.command,
        errorName: draft.errorName ?? "Error",
        message: draft.message,
        stack: draft.stack,
        flags: draft.flags,
        fingerprint: fingerprint(draft),
        version: draft.version ?? "unknown",
        platform: draft.platform ?? "unknown",
        firstSeen: draft.firstSeen ?? now,
        lastSeen: now,
        occurrences: draft.occurrences ?? 1,
      });
    }

    try {
      rmSync(join(incomingDir(root), name), { force: true });
    } catch {
      /* Re-adopting a record next run is harmless; the fingerprint merges it. */
    }
  }

  for (const report of adopted) spool(root, report);
  return adopted;
}

/** Every report waiting to be filed, including any the hooks left behind. */
export function pending(root: string): Report[] {
  adoptIncoming(root);
  return readSpool(root).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
}

function drop(root: string, fp: string): void {
  try {
    rmSync(join(spoolDir(root), `${fp}.json`), { force: true });
  } catch {
    /* Nothing useful to do — the entry will merge on the next occurrence. */
  }
}

/**
 * Mark a fingerprint as filed, so the next occurrence comments on the existing
 * issue instead of opening a second one.
 *
 * This map — not a GitHub search — is the primary dedup. GitHub's search index
 * trails issue creation by seconds to minutes, so a crash loop that searched
 * would find nothing and file duplicates for as long as the lag lasted.
 */
export function resolvePosted(root: string, fp: string, issue: number): void {
  const map = readJson<Record<string, number>>(postedPath(root)) ?? {};
  map[fp] = issue;
  writeJson(postedPath(root), map);
  drop(root, fp);
}

export function postedIssue(root: string, fp: string): number | null {
  const map = readJson<Record<string, number>>(postedPath(root)) ?? {};
  return map[fp] ?? null;
}

export function clearSpool(root: string): void {
  try {
    if (existsSync(spoolDir(root))) rmSync(spoolDir(root), { recursive: true, force: true });
  } catch {
    /* Best effort — the cap keeps an unclearable spool bounded anyway. */
  }
}
