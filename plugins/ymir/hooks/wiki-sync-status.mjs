#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
const wikiRoot = "./wiki";

// If wiki dir or binary absent → silent exit
if (!existsSync(wikiRoot) || !PLUGIN_ROOT) {
  process.exit(0);
}

const wikiBin = join(PLUGIN_ROOT, "wiki-cli/bin/wiki");
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
  // Never block session
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
