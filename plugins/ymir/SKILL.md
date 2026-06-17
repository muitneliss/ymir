---
name: ymir
description: Ymir scaffolds a project's harness skeleton for THIS project (the current working directory) — rules, lint, CI lint, wiki/context, and CLAUDE.md/AGENT.md. Use whenever the user asks Ymir to do something to the project, e.g. "ymir init for this project", "ymir add lint for this project", "ymir add rules", "ymir set up CI", "scaffold the harness", "bootstrap this repo". Interviews the user about their techstack and builds only the skeleton — never application code.
argument-hint: "init | add lint | add rules | add ci | add context | add claude.md — what to do for this project"
---

# Ymir

Ymir builds the **harness skeleton** for the current project — never application
code. The user drives all real coding through Claude Code; Ymir only lays down
the foundation that steers it:

1. **rules** — coding standards / conventions
2. **lint** — linter config for the chosen stack
3. **CI lint** — a CI workflow that runs the linter
4. **wiki / context** — a place for project knowledge
5. **CLAUDE.md / AGENT.md** — the file that steers Claude Code on this repo

## How this skill works

This is a single dispatcher. The user's words after `ymir` are the intent
(`$ARGUMENTS`) — interpret them and act on **this project** (the current working
directory). There is no fixed command list; map the intent to one of the harness
concerns above. Examples:

| User says | Intent |
|---|---|
| `ymir init for this project` | run the full flow: interview, then scaffold every harness piece that fits the stack |
| `ymir add lint for this project` | add just the linter config (+ wire it into CI if CI exists) |
| `ymir add rules` | add/extend the rules file |
| `ymir set up CI` | add the CI lint workflow |
| anything ambiguous | ask a short clarifying question, then proceed |

If `$ARGUMENTS` is empty, treat it as `init`.

## Step 1 — Know the stack (socratic interview)

The user does not hand-write code, so Ymir cannot infer the stack from existing
files alone. Ask, one decision at a time (AskUserQuestion), only what the
requested action needs:

- **Language**: Go, TypeScript, … (drives linter + CI choice)
- **Layer**: frontend, backend, or both
- (more questions are added as the harness templates mature)

For a narrow action (e.g. `add lint`) ask only the questions that action needs;
for `init`, gather the full picture up front.

## Step 2 — Scaffold

Map the intent to a harness concern and scaffold it into the current project
(cwd). Other concerns (lint, CI, rules, CLAUDE.md) are still stubbed; the
**wiki / context** concern is implemented below.

### wiki / context

Triggered by intents like `ymir add context`, `ymir add wiki`, or as part of
`ymir init`. This lays down an LLM-maintained wiki backed by the Ymir wiki CLI.

Do all of the following with tools (Bash/Write), in order:

1. **Create the tree** under the project root:
   - `wiki/raw/`, `wiki/sources/`, `wiki/notes/` — each with a `.gitkeep`
     (copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/gitkeep`).
   - `wiki/SCHEMA.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/SCHEMA.md`,
     then replace the literal `PROJECT_NAME` with the current directory's base
     name.
   - `wiki/index.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/index.seed.md`.
   - `wiki/log.md` — copy `${CLAUDE_PLUGIN_ROOT}/templates/wiki/log.seed.md`.
2. **Install the hook**:
   - Copy `${CLAUDE_PLUGIN_ROOT}/templates/hooks/block-wiki-edits.mjs` to
     `.claude/hooks/block-wiki-edits.mjs`.
   - Merge `${CLAUDE_PLUGIN_ROOT}/templates/hooks/settings.snippet.json` into `.claude/settings.json`.
     If `.claude/settings.json` exists, deep-merge the `hooks.PreToolUse` array
     (append the matcher entry; do not clobber existing hooks). If it does not
     exist, create it from the snippet.
3. **Point CLAUDE.md at the wiki**: append (creating the file if absent) a block:

   ```markdown
   ## Wiki / Context
   This project has an LLM-maintained wiki under `wiki/`. You MUST NOT hand-edit
   wiki docs (`wiki/sources`, `wiki/notes`, `index.md`, `log.md`) — they are
   managed by the Ymir wiki CLI and a PreToolUse hook blocks direct edits. See
   `wiki/SCHEMA.md` for the rules and command reference.
   ```
4. **Verify**: run
   `${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki --root ./wiki validate`
   and confirm it prints `wiki valid`. If it errors, stop and report.
5. **Tell the user** the qmd one-time setup (from `wiki/SCHEMA.md`):
   `qmd collection add ./wiki --name <project>-wiki && qmd embed`.

Never write application code; only the harness skeleton above.

## Boundaries

- Operate on the current project only ("this project" = cwd).
- Build only the skeleton — never generate application/business code.
- Prefer asking over assuming; the interview is the source of truth.
