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
`ymir init`. The wiki harness is scaffolded by **a single CLI call** — never by
hand-editing files. The CLI owns the tree, the hook, the `.claude/settings.json`
entry, the `CLAUDE.md` block, and the validation step.

From the project root, run:

```bash
"${CLAUDE_PLUGIN_ROOT}/wiki-cli/bin/wiki" --root ./wiki init
```

It is idempotent — safe to re-run. On success the last line is `wiki valid`.
If it errors, stop and report.

Then tell the user the qmd one-time setup (also documented in `wiki/SCHEMA.md`):

```bash
qmd collection add ./wiki --name <project>-wiki
```

Search is keyword-only (BM25) — no `qmd embed`, no local LLM. Re-run
`qmd collection add` after adding pages to refresh the index.

**Design principle:** every change to the wiki harness goes through the wiki
CLI. The skill must never copy templates, edit `.claude/settings.json`, or
append to `CLAUDE.md` directly.

Never write application code; only the harness skeleton above.

## Boundaries

- Operate on the current project only ("this project" = cwd).
- Build only the skeleton — never generate application/business code.
- Prefer asking over assuming; the interview is the source of truth.
