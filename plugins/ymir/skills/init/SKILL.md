---
name: ymir
description: Entry point for scaffolding a project's harness skeleton — rules, lint, CI lint, wiki/context, and CLAUDE.md/AGENT.md. Use when starting a new project, bootstrapping a repo, setting up project conventions, or when the user asks to "init the harness", "set up the skeleton", "scaffold the project foundation", or "run ymir". Interviews the user about their techstack (language, frontend/backend) and builds the skeleton. Never generates application code.
argument-hint: "[optional: target directory, defaults to cwd]"
---

# Ymir — Project Harness Scaffolder

Ymir builds the **mandatory skeleton** every project should start with. It does
NOT write application code. It produces the harness:

1. **rules** — coding standards / conventions
2. **lint** — linter config for the chosen stack
3. **CI lint** — a CI workflow that runs the linter
4. **wiki / context** — a place for project knowledge
5. **CLAUDE.md / AGENT.md** — the file that steers Claude Code on this repo

The user does not hand-write code — they drive everything through Claude Code.
So Ymir gathers **all** techstack facts up front in a socratic interview, then
scaffolds a harness matched to those answers.

## Step 1 — Socratic techstack interview

Ask the user, one decision at a time, using the AskUserQuestion tool. Start with
the two coarsest axes, then narrow:

- **Language**: Go, TypeScript, … (drives the linter + CI choice)
- **Layer**: frontend, backend, or both
- (further questions are added as the harness templates mature)

Capture the answers — they are the inputs to the scaffold step.

## Step 2 — Scaffold the harness

> **TODO (not yet implemented).** The harness templates per stack are still being
> designed. For now, after the interview, summarize the captured techstack and
> tell the user which harness pieces *would* be generated, then stop.
>
> When implemented, this step will, based on the interview answers, create:
> - the linter config (e.g. Go → `golangci-lint`)
> - the CI lint workflow (e.g. GitHub Actions)
> - a `rules` file
> - a `wiki/` or `context/` scaffold
> - a `CLAUDE.md` / `AGENT.md` seeded with the project's conventions

## Boundaries

- Only build the skeleton. Never generate application/business code.
- Prefer asking over assuming — the interview is the source of truth.
