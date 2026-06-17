#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync,
  readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

function detectAssetLabel(unameSM) {
  const s = unameSM.trim();
  if (s === "Darwin arm64")                         return "darwin-arm64";
  if (s === "Darwin x86_64")                        return "darwin-x64";
  if (s === "Linux x86_64")                         return "linux-x64";
  if (s === "Linux aarch64" || s === "Linux arm64") return "linux-arm64";
  throw new Error(`Unsupported platform: "${s}". Supported: Darwin/Linux × arm64/x86_64.`);
}

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
if (!PLUGIN_ROOT) {
  process.stderr.write("[ymir] CLAUDE_PLUGIN_ROOT not set — cannot ensure wiki binary\n");
  process.exit(2);
}

let pluginVersion;
try {
  const manifest = JSON.parse(
    readFileSync(join(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf8")
  );
  pluginVersion = manifest.version;
} catch (e) {
  process.stderr.write(`[ymir] Cannot read plugin.json: ${e.message}\n`);
  process.exit(2);
}

if (typeof pluginVersion !== "string" || !/^\d+\.\d+\.\d+/.test(pluginVersion)) {
  process.stderr.write(`[ymir] Invalid plugin version: ${JSON.stringify(pluginVersion)}\n`);
  process.exit(2);
}

const binDir    = join(PLUGIN_ROOT, "wiki-cli/bin");
const binPath   = join(binDir, "wiki");
const stampPath = join(binDir, ".version");

// Fast path: already installed and version matches
if (existsSync(binPath) && existsSync(stampPath)) {
  if (readFileSync(stampPath, "utf8").trim() === pluginVersion) process.exit(0);
}

// Detect platform
let label;
try {
  const uname = execSync("uname -sm", { encoding: "utf8" });
  label = detectAssetLabel(uname);
} catch (e) {
  process.stderr.write(`[ymir] Platform detection failed: ${e.message}\n`);
  process.exit(2);
}

const base     = `https://github.com/muitneliss/ymir/releases/download/v${pluginVersion}`;
const assetUrl = `${base}/wiki-${label}`;
const sumsUrl  = `${base}/SHA256SUMS.txt`;

mkdirSync(binDir, { recursive: true });

const tmpBin  = `${binPath}.tmp`;
const tmpSums = join(binDir, "SHA256SUMS.txt.tmp");

// Download binary
const dlBin = spawnSync("curl", ["-fsSL", "--output", tmpBin, assetUrl], { stdio: "inherit" });
if (dlBin.status !== 0) {
  try { unlinkSync(tmpBin); } catch {}
  process.stderr.write(`[ymir] Failed to download wiki binary: ${assetUrl}\n`);
  process.exit(2);
}

// Download checksum file
const dlSums = spawnSync("curl", ["-fsSL", "--output", tmpSums, sumsUrl], { stdio: "inherit" });
if (dlSums.status !== 0) {
  try { unlinkSync(tmpBin); } catch {}
  try { unlinkSync(tmpSums); } catch {}
  process.stderr.write(`[ymir] Failed to download SHA256SUMS: ${sumsUrl}\n`);
  process.exit(2);
}

// Verify sha256
const sumsText     = readFileSync(tmpSums, "utf8");
const expectedLine = sumsText.split("\n").find((l) => {
  const name = l.trim().split(/\s+/)[1];
  return name === `wiki-${label}`;
});
if (!expectedLine) {
  process.stderr.write(`[ymir] No sha256 entry for wiki-${label} in SHA256SUMS.txt\n`);
  process.exit(2);
}
const expectedHash = expectedLine.trim().split(/\s+/)[0];
const actualHash   = createHash("sha256").update(readFileSync(tmpBin)).digest("hex");
if (actualHash !== expectedHash) {
  process.stderr.write(
    `[ymir] SHA256 mismatch for wiki-${label}:\n  expected ${expectedHash}\n  got      ${actualHash}\n`
  );
  process.exit(2);
}

// Install
renameSync(tmpBin, binPath);
chmodSync(binPath, 0o755);
writeFileSync(stampPath, pluginVersion);
try { unlinkSync(tmpSums); } catch { /* ignore cleanup failure */ }

process.stdout.write(`[ymir] Installed wiki binary v${pluginVersion} (${label})\n`);
