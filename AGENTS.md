# Agent Instructions

Shared instructions for every coding agent in this repository. Codex reads this
file natively; Claude Code imports it from `CLAUDE.md`. Put shared rules here,
and only Claude Code–specific notes in `CLAUDE.md`.

## Wiki / Context
This project has an LLM-maintained wiki under `wiki/`. You MUST NOT hand-edit
wiki docs (`wiki/sources`, `wiki/notes`, `wiki/index.md`, `wiki/log.md`) — they
are managed by the Ymir wiki CLI. Write them only through
`./wiki/bin/wiki --root ./wiki <command>` from the project root (`help` lists
the commands). Direct edits are allowed only in `wiki/raw/**` and
`wiki/SCHEMA.md`. See `wiki/SCHEMA.md` for the rules and command reference.

A PreToolUse hook blocks direct file edits to those paths in both Claude Code
(`.claude/settings.json`) and Codex (`.codex/hooks.json`).

Root `*.md` files, including this one and `CLAUDE.md`, are wiki-tracked sources
(`wiki/tracked.yaml`). After changing one, re-ingest it with
`ingest --source <path> --title "<page title>"`, or CI's
`wiki check --error-on-untracked-sources` fails.
