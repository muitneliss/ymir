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

const CLAUDE_MARKER = "## Wiki / Context";

export const CLAUDE_BLOCK = `## Wiki / Context
This project has an LLM-maintained wiki under \`wiki/\`. You MUST NOT hand-edit
wiki docs (\`wiki/sources\`, \`wiki/notes\`, \`index.md\`, \`log.md\`) — they are
managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
\`wiki/SCHEMA.md\` for the rules and command reference.
`;

export function claudeBlockPresent(content: string): boolean {
  return content.split("\n").some((line) => line.trim() === CLAUDE_MARKER);
}

export function appendClaudeBlock(content: string): string {
  if (claudeBlockPresent(content)) return content;
  if (content.length === 0) return CLAUDE_BLOCK;
  const trailing = content.endsWith("\n") ? "" : "\n";
  return `${content}${trailing}\n${CLAUDE_BLOCK}`;
}
