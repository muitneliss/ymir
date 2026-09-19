---
title: Taskfile Guideline
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/references/taskfile.md
source_path: plugins/ymir/references/taskfile.md
source_hash: 0cb111dac8d0ba7d46b583b0e7d0bb3eb19f861cf6c411502de48585d916116d
ingested: 2026-09-19
---

# Taskfile Guideline

Skill reference that defines the `taskfile` concern and is the source of truth both for its questions in [[Socratic Interview Reference]] and for generation in [[Playbook Taskfile]].

The runner is Task (go-task) and only Task: Ymir generates no `Makefile` or `justfile`, so a project that wants one skips the concern. The concern exists because every other concern produces a command someone must remember — the linter invocation, the tests, the build — and without one entrypoint those commands get copied into a README, a CI step and a steering file, then drift apart. The Taskfile is the single owner of "how this repo is run": CI, the agent and the human all call `task lint`. The same argument is why it stays skippable — a repo whose `package.json` scripts already are that owner gains a layer and loses nothing by declining.

`wraps` decides what goes inside `cmds`: `commands` puts the tool invocation directly in the task (the Taskfile becomes the single owner), `scripts` calls an existing `bun run lint` / `make test` (a uniform front door over scripts other tooling already depends on). Generating both is the duplication the concern exists to prevent.

The reference carries the expected task names (`default`, `lint`, `lint:fix`, `test`, `build`, `dev`, `ci`), namespacing with `:`, `internal: true` for building blocks, and a baseline file shape: `version: '3'` (the schema version, not the Task version), top-level `silent: true` so output is the tool's own, a `desc` on every task, and a `default` task running `task --list` as the discovery surface an agent lands on in an unfamiliar repo.

Six behaviours verified against Task 3.53.1 rather than assumed, because each one bites a Taskfile written by inference: every `cmds` entry runs in its own shell, so a `cd` does not carry into the next entry (use `dir:`, or chain with `&&`); `deps` run in parallel, so ordering needs task calls in `cmds` instead; `task --list` hides tasks without a `desc`; `sources`/`generates` fingerprint a task and skip it while its inputs are unchanged, which silently stops a `lint` task from linting if misapplied; `{{.CLI_ARGS}}` forwards everything after `--` so a task never becomes a straitjacket around the tool; and an unknown task name exits 200, not 1.

Task installs as a single binary (brew, npm `@go-task/cli`, `go install`, or the `taskfile.dev/install.sh` script for CI) and is never added as a project dependency. In CI the official `go-task/setup-task@v1` action installs it — `arduino/setup-task@v3` is the upstream it was forked from and also works — after which the workflow calls `task <name>` instead of repeating commands, as [[Playbook CI]] instructs. Verification is `task --list` exiting 0 and listing every entry in `concerns.taskfile.tasks[]`.
