![Ymir Logo](assets/ymir-minimal.svg)

# Ymir

[![release-please](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml/badge.svg)](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml)
[![release](https://img.shields.io/github/v/release/muitneliss/ymir?sort=semver)](https://github.com/muitneliss/ymir/releases)

A Claude Code plugin marketplace + plugin that produces a **harness spec** for a
repo — rules (as native `.claude/rules/`), lint, CI lint, wiki/context, and
`CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code. It first **explores your codebase**,
then runs a **deep Socratic interview** — per concern it probes the *why*,
recommends a grounded option, and captures the rationale — re-audits for
consistency, and emits a spec under `.ymir/`:

- `.ymir/harness-profile.yaml` — your audited decisions (machine-readable).
- `.ymir/harness-playbook.md` — step-by-step instructions an LLM follows to
  generate the harness.

You then generate the harness with `ymir apply`, which reads the spec and writes
the real files (backing up anything it overwrites); `ymir revert` undoes the last
apply. You can also drive generation by hand in a normal Claude Code session,
guided by the spec.

## Layout

```
ymir/
├── .claude-plugin/
│   └── marketplace.json        # the "ymir" marketplace
└── plugins/
    └── ymir/                   # the "ymir" plugin
        ├── .claude-plugin/
        │   └── plugin.json
        └── SKILL.md            # single dispatcher skill → /ymir
```

Ymir is one skill, not a fixed command list. Whatever you type after `ymir` is
the intent; the skill interprets it and acts on the current project:

```
ymir init for this project
ymir add lint for this project
ymir add rules
ymir set up CI
ymir apply            # generate the harness from the spec
ymir revert           # undo the last apply
```

## Install

```shell
/plugin marketplace add muitneliss/ymir
/plugin install ymir@ymir
/reload-plugins
```

Then: `/ymir init for this project`

## Status

`v0.4.0`. Ymir runs a codebase-first flow: it scans the repo, then runs a deep
per-concern Socratic interview (probe *why* → recommend → confirm, capturing
`why`/`findings`), a consistency + reflection gate, a spec-review gate, and a spec
emitted to `.ymir/` (`harness-profile.yaml` + `harness-playbook.md`); `ymir apply`
then generates the harness from that spec (with backups + `ymir revert`). The
spec's per-concern playbook sections live in `plugins/ymir/templates/playbook/`;
the interview engine is in `plugins/ymir/references/socratic-interview.md`. The
**rules** concern emits native `.claude/rules/*.md`. The **wiki / context** section
drives the bundled wiki tooling (`plugins/ymir/wiki-cli`, templates, and the
PreToolUse hook that blocks hand-editing wiki docs). The `/ymir add context` (or
`add wiki`) intent scaffolds the wiki directly, as before.
