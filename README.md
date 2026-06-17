![Ymir Logo](assets/ymir-minimal.svg)

# Ymir

[![release-please](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml/badge.svg)](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml)
[![release](https://img.shields.io/github/v/release/muitneliss/ymir?sort=semver)](https://github.com/muitneliss/ymir/releases)

A Claude Code plugin marketplace + plugin that scaffolds the **mandatory project
harness** every repo should start with — rules, lint, CI lint, wiki/context, and
`CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code. It interviews you about your
techstack (Go vs TypeScript, frontend vs backend, …) and builds only the
skeleton. You then drive the actual development through Claude Code, guided by the
harness Ymir laid down.

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
```

## Try it locally

```shell
/plugin marketplace add ./
/plugin install ymir@ymir
/reload-plugins
```

Then: `/ymir init for this project`

## Status

`v0.2.0`. The **wiki / context** harness piece is implemented: `/ymir add
context` scaffolds an LLM-maintained `wiki/` (backed by the bundled wiki CLI in
`plugins/ymir/wiki-cli`), installs a PreToolUse hook that blocks hand-editing
wiki docs, and wires in `qmd` for search. The socratic interview and the other
harness pieces (lint, CI, rules) are still stubbed.
