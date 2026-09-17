#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import {
  appendFileSync, chmodSync, existsSync, mkdirSync,
  readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// Keep in sync with wiki-cli/src/platform.ts (cannot import TS from this .mjs hook).
function detectAssetLabel(unameSM) {
  const s = unameSM.trim();
  if (s === "Darwin arm64")                         return "darwin-arm64";
  if (s === "Darwin x86_64")                        return "darwin-x64";
  if (s === "Linux x86_64")                         return "linux-x64";
  if (s === "Linux aarch64" || s === "Linux arm64") return "linux-arm64";
  throw new Error(`Unsupported platform: "${s}". Supported: Darwin/Linux × arm64/x86_64.`);
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(SCRIPT_DIR, "..");

const optedOut = ["DO_NOT_TRACK", "DISABLE_TELEMETRY"].some(
  (k) => process.env[k] && process.env[k] !== "0"
) || process.env.YMIR_REPORT === "off";

/**
 * Fail the install, leaving a record the CLI can file later.
 *
 * A failure here is invisible to the wiki CLI — the binary it would have
 * reported through is the very thing that did not install. So the record is
 * appended as JSONL and completed on the next `wiki` run, which keeps the whole
 * reporting pipeline (redaction, fingerprinting, dedup) in one place instead of
 * being half-copied into a hook that cannot import it.
 */
function bail(errorName, message) {
  process.stderr.write(`[ymir] ${message}\n`);

  if (!optedOut) {
    try {
      const dir = join(process.env.YMIR_HOME ?? join(homedir(), ".ymir"), "reports", "incoming");
      mkdirSync(dir, { recursive: true });
      appendFileSync(
        join(dir, "hooks.jsonl"),
        JSON.stringify({
          kind: "hook",
          command: "ensure-wiki-binary",
          errorName,
          message,
          version: typeof pluginVersion === "string" ? pluginVersion : "unknown",
          platform: typeof label === "string" ? label : "unknown",
        }) + "\n"
      );
    } catch { /* A hook must never fail because reporting failed. */ }
  }

  process.exit(2);
}

let pluginVersion;
let label;
try {
  const manifest = JSON.parse(
    readFileSync(join(SKILL_ROOT, ".claude-plugin/plugin.json"), "utf8")
  );
  pluginVersion = manifest.version;
} catch (e) {
  bail("ManifestUnreadable", `Cannot read plugin.json: ${e.message}`);
}

if (typeof pluginVersion !== "string" || !/^\d+\.\d+\.\d+/.test(pluginVersion)) {
  bail("InvalidVersion", `Invalid plugin version: ${JSON.stringify(pluginVersion)}`);
}

const binDir    = join(SKILL_ROOT, "wiki-cli/bin");
const binPath   = join(binDir, "wiki");
const stampPath = join(binDir, ".version");

if (existsSync(binPath) && existsSync(stampPath)) {
  if (readFileSync(stampPath, "utf8").trim() === pluginVersion) process.exit(0);
}

try {
  const uname = execSync("uname -sm", { encoding: "utf8" });
  label = detectAssetLabel(uname);
} catch (e) {
  bail("UnsupportedPlatform", `Platform detection failed: ${e.message}`);
}

const base     = `https://github.com/muitneliss/ymir/releases/download/ymir-v${pluginVersion}`;
const assetUrl = `${base}/wiki-${label}`;
const sumsUrl  = `${base}/SHA256SUMS.txt`;

mkdirSync(binDir, { recursive: true });

// Scratch paths are per-process because more than one run can be in flight at
// once — Claude Code fires this at session start, and installing the skill can
// trigger it again while the first download is still going. Sharing one
// `wiki.tmp` let two curls interleave into the same file, which either corrupts
// the binary past the sha256 gate or makes one run delete the other's work
// mid-flight. The final rename is atomic, so the last verified writer wins.
const tmpBin  = `${binPath}.${process.pid}.tmp`;
const tmpSums = join(binDir, `SHA256SUMS.txt.${process.pid}.tmp`);

const cleanupTmp = () => {
  try { unlinkSync(tmpBin); } catch {}
  try { unlinkSync(tmpSums); } catch {}
};

const dlBin = spawnSync("curl", ["-fsSL", "--output", tmpBin, assetUrl], { stdio: "inherit" });
if (dlBin.status !== 0) {
  cleanupTmp();
  bail("DownloadFailed", `Failed to download wiki binary: ${assetUrl}`);
}

const dlSums = spawnSync("curl", ["-fsSL", "--output", tmpSums, sumsUrl], { stdio: "inherit" });
if (dlSums.status !== 0) {
  cleanupTmp();
  bail("ChecksumDownloadFailed", `Failed to download SHA256SUMS: ${sumsUrl}`);
}

const sumsText     = readFileSync(tmpSums, "utf8");
const expectedLine = sumsText.split("\n").find((l) => {
  const name = l.trim().split(/\s+/)[1];
  return name === `wiki-${label}`;
});
if (!expectedLine) {
  cleanupTmp();
  bail("ChecksumMissing", `No sha256 entry for wiki-${label} in SHA256SUMS.txt`);
}
const expectedHash = expectedLine.trim().split(/\s+/)[0];
const actualHash   = createHash("sha256").update(readFileSync(tmpBin)).digest("hex");
if (actualHash !== expectedHash) {
  cleanupTmp();
  bail(
    "ChecksumMismatch",
    `SHA256 mismatch for wiki-${label}:\n  expected ${expectedHash}\n  got      ${actualHash}`
  );
}

renameSync(tmpBin, binPath);
chmodSync(binPath, 0o755);
writeFileSync(stampPath, pluginVersion);
try { unlinkSync(tmpSums); } catch { /* ignore cleanup failure */ }

process.stdout.write(`[ymir] Installed wiki binary v${pluginVersion} (${label})\n`);
