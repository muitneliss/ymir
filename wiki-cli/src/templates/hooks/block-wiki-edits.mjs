#!/usr/bin/env node
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = input?.tool_input?.file_path ?? "";

const norm = file.replaceAll("\\", "/");

const blocked =
  /\/wiki\/sources\//.test(norm) ||
  /\/wiki\/notes\//.test(norm) ||
  /\/wiki\/index\.md$/.test(norm) ||
  /\/wiki\/log\.md$/.test(norm);

if (blocked) {
  process.stdout.write(
    JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "Wiki docs are CLI-managed. Use the Ymir wiki CLI (ingest/note/index/log) instead of editing wiki files directly. Allowed direct edits: wiki/raw/** and wiki/SCHEMA.md.",
        },
      },
      null,
      2,
    ),
  );
}
process.exit(0);
