import type { PreToolUseEntry } from "./templates/embedded.js";

export type Settings = {
  hooks?: {
    PreToolUse?: PreToolUseEntry[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

function entriesEqual(a: PreToolUseEntry, b: PreToolUseEntry): boolean {
  if (a.matcher !== b.matcher) return false;
  if (a.hooks.length !== b.hooks.length) return false;
  return a.hooks.every((h, i) => {
    const bh = b.hooks[i];
    return bh !== undefined && h.type === bh.type && h.command === bh.command;
  });
}

export function mergeSettings(
  existing: Settings,
  entry: PreToolUseEntry,
): Settings {
  const nextHooks = { ...(existing.hooks ?? {}) };
  const list: PreToolUseEntry[] = Array.isArray(nextHooks.PreToolUse)
    ? [...nextHooks.PreToolUse]
    : [];
  if (!list.some((e) => entriesEqual(e, entry))) list.push(entry);
  nextHooks.PreToolUse = list;
  return { ...existing, hooks: nextHooks };
}
