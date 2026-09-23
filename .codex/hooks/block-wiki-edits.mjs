#!/usr/bin/env node
// Codex adapter for the wiki edit guard.
//
// The policy (which paths are blocked, and the deny message) lives only in
// `.claude/hooks/block-wiki-edits.mjs`, which `wiki init` generates and rewrites.
// Codex reports file edits as `apply_patch` with the patch text in
// `tool_input.command`, so this script extracts every path the patch touches and
// asks that script about each one, in the Claude `tool_input.file_path` shape.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const policy = join(dirname(fileURLToPath(import.meta.url)), "../../.claude/hooks/block-wiki-edits.mjs");
const input = JSON.parse(readFileSync(0, "utf8"));
const cwd = input.cwd ?? process.cwd();

const command = input.tool_input?.command;
const patch = Array.isArray(command) ? command.join("\n") : String(command ?? "");
const paths = [...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)]
  .map((m) => m[1].trim());
if (typeof input.tool_input?.file_path === "string") paths.push(input.tool_input.file_path);

for (const path of paths) {
  const result = spawnSync(process.execPath, [policy], {
    input: JSON.stringify({ ...input, tool_input: { file_path: resolve(cwd, path) } }),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `wiki edit guard failed: ${policy}\n`);
    process.exit(1);
  }
  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
    break;
  }
}
process.exit(0);
