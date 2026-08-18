#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(SCRIPT_DIR, "..");
const wikiRoot = "./wiki";

if (!existsSync(wikiRoot)) {
  process.exit(0);
}

const wikiBin = join(SKILL_ROOT, "wiki-cli/bin/wiki");
if (!existsSync(wikiBin)) {
  process.exit(0);
}

try {
  const result = spawnSync(wikiBin, ["--root", wikiRoot, "status", "--json"], {
    encoding: "utf8",
    timeout: 15000,
  });

  if (result.error || result.status === null) {
    process.exit(0);
  }

  let report;
  try {
    report = JSON.parse(result.stdout ?? "");
  } catch {
    process.exit(0);
  }

  const stale = (report.sources ?? []).filter((s) => s.state === "stale");
  const missing = (report.sources ?? []).filter((s) => s.state === "missing");

  if (stale.length === 0 && missing.length === 0) {
    process.exit(0);
  }

  process.stdout.write(formatSyncMessage(stale, missing, wikiRoot));
} catch {
  // never block session start
}

process.exit(0);

function formatSyncMessage(stale, missing, root) {
  const lines = ["[ymir] Wiki out of date. Re-ingest these to match current files:"];
  for (const s of stale) {
    lines.push(`  - page "${s.title}"  ← ${s.source_path} (changed)`);
  }
  for (const s of missing) {
    lines.push(`  - page "${s.title}"  ← ${s.source_path ?? "(unknown)"} (missing)`);
  }
  lines.push("For each: read the file, then run:");
  lines.push(`  wiki --root ${root} ingest --source <path> --title "<page title>"`);
  return lines.join("\n") + "\n";
}
