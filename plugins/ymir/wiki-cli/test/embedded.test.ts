import { describe, it, expect } from "bun:test";
import {
  SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK, SETTINGS_HOOK_ENTRY,
} from "../src/templates/embedded.js";

describe("embedded templates", () => {
  it("SCHEMA contains PROJECT_NAME placeholder", () => {
    expect(SCHEMA_TPL).toContain("PROJECT_NAME");
  });
  it("INDEX_SEED has Wiki Index heading", () => {
    expect(INDEX_SEED).toContain("# Wiki Index");
  });
  it("LOG_SEED has Wiki Log heading", () => {
    expect(LOG_SEED).toContain("# Wiki Log");
  });
  it("BLOCK_HOOK is the node hook script", () => {
    expect(BLOCK_HOOK).toContain("hookSpecificOutput");
    expect(BLOCK_HOOK).toContain("PreToolUse");
  });
  it("SETTINGS_HOOK_ENTRY targets Write|Edit|MultiEdit", () => {
    expect(SETTINGS_HOOK_ENTRY.matcher).toBe("Write|Edit|MultiEdit");
    const firstHook = SETTINGS_HOOK_ENTRY.hooks[0];
    expect(firstHook?.command).toContain(
      ".claude/hooks/block-wiki-edits.mjs",
    );
  });
});
