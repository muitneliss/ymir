@AGENTS.md

<!-- Shared rules live in AGENTS.md. Keep this heading: `wiki init` looks for it
and appends a duplicate wiki block to CLAUDE.md when it is missing. -->
## Wiki / Context
The wiki rules are in `AGENTS.md` (imported above). In Claude Code, the
PreToolUse hook `.claude/hooks/block-wiki-edits.mjs` enforces them, and the
SessionStart hooks in `.claude/settings.json` fetch the wiki binary and report
wiki drift.
