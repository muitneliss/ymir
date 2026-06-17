import { describe, it, expect } from "bun:test";
import { mergeSettings, type Settings } from "../src/scaffold.js";
import { SETTINGS_HOOK_ENTRY } from "../src/templates/embedded.js";

describe("mergeSettings", () => {
  it("adds the entry to empty settings", () => {
    const out = mergeSettings({}, SETTINGS_HOOK_ENTRY);
    expect(out.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });

  it("appends to existing PreToolUse without duplicating", () => {
    const other = {
      matcher: "Bash",
      hooks: [{ type: "command" as const, command: "echo hi" }],
    };
    const start: Settings = { hooks: { PreToolUse: [other] } };
    const out = mergeSettings(start, SETTINGS_HOOK_ENTRY);
    expect(out.hooks?.PreToolUse).toEqual([other, SETTINGS_HOOK_ENTRY]);
  });

  it("is idempotent on re-merge", () => {
    const once = mergeSettings({}, SETTINGS_HOOK_ENTRY);
    const twice = mergeSettings(once, SETTINGS_HOOK_ENTRY);
    expect(twice.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });

  it("preserves unrelated hooks namespaces and top-level keys", () => {
    const start: Settings = {
      hooks: { SessionStart: [{ matcher: "*", hooks: [{ type: "command", command: "x" }] }] },
      otherKey: 42,
    };
    const out = mergeSettings(start, SETTINGS_HOOK_ENTRY);
    expect(out.otherKey).toBe(42);
    expect(out.hooks?.SessionStart).toEqual(start.hooks!.SessionStart);
    expect(out.hooks?.PreToolUse).toEqual([SETTINGS_HOOK_ENTRY]);
  });
});
