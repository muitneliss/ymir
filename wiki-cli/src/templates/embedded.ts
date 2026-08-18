import SCHEMA_TPL from "./wiki/SCHEMA.md" with { type: "text" };
import INDEX_SEED from "./wiki/index.seed.md" with { type: "text" };
import LOG_SEED from "./wiki/log.seed.md" with { type: "text" };
import BLOCK_HOOK from "./hooks/block-wiki-edits.mjs" with { type: "text" };

export { SCHEMA_TPL, INDEX_SEED, LOG_SEED, BLOCK_HOOK };

export type HookCmd = { type: "command"; command: string };
export type PreToolUseEntry = { matcher: string; hooks: HookCmd[] };

export const SETTINGS_HOOK_ENTRY: PreToolUseEntry = {
  matcher: "Write|Edit|MultiEdit",
  hooks: [
    {
      type: "command",
      command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-wiki-edits.mjs"',
    },
  ],
};
