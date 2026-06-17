# Ymir

[![release-please](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml/badge.svg)](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml)
[![release](https://img.shields.io/github/v/release/muitneliss/ymir?sort=semver)](https://github.com/muitneliss/ymir/releases)

A Claude Code plugin marketplace + plugin that produces a **harness spec** for a
repo — rules, lint, CI lint, wiki/context, and `CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code, and it does **not** write the harness
files itself. It interviews you across a checklist of harness concerns, re-audits
to confirm nothing is missing, and emits a spec under `.ymir/`:

- `.ymir/harness-profile.yaml` — your audited decisions (machine-readable).
- `.ymir/harness-playbook.md` — step-by-step instructions an LLM follows to
  generate the harness.

You then drive generation through a normal Claude Code session, guided by the spec
Ymir produced.

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

`v0.2.0`. Ymir runs a 3-step flow: a checklist-driven socratic interview, a
re-audit gate, and a spec emitted to `.ymir/` (`harness-profile.yaml` +
`harness-playbook.md`). The spec's per-concern playbook sections live in
`plugins/ymir/templates/playbook/`. The **wiki / context** section drives the
bundled wiki tooling (`plugins/ymir/wiki-cli`, templates, and the PreToolUse hook
that blocks hand-editing wiki docs). The skill itself writes only the spec;
generating the harness from it is a downstream Claude Code step — *except*
`/ymir add context` (or `add wiki`), which still scaffolds the wiki directly, as
before.
