![Ymir Logo](assets/ymir-minimal.svg)

# Ymir

[![release-please](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml/badge.svg)](https://github.com/muitneliss/ymir/actions/workflows/release-please.yml)
[![release](https://img.shields.io/github/v/release/muitneliss/ymir?sort=semver)](https://github.com/muitneliss/ymir/releases)
[![skills.sh](https://skills.sh/b/muitneliss/ymir)](https://skills.sh/muitneliss/ymir)

A Claude Code plugin and agent skill that produces a **harness spec** for a
repo — rules, lint, CI lint, wiki/context, and `CLAUDE.md`/`AGENT.md`.

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
    └── ymir/                   # the "ymir" plugin / skill
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

### Claude Code plugin (recommended for Claude Code users)

```shell
/plugin marketplace add muitneliss/ymir
/plugin install ymir@ymir
/reload-plugins
```

Then: `/ymir init for this project`

The plugin marketplace installs via Claude Code's native plugin system, which
wires up hooks automatically (including the wiki PreToolUse guard).

### Agent skill via the skills CLI (Claude Code, Cursor, Codex, and others)

```shell
npx skills@latest add muitneliss/ymir
```

This installs Ymir as an agent skill under `.claude/skills/ymir/` (Claude Code)
or the agent-specific equivalent. Distribution is purely git — `skills add` clones
directly from this repo; there is no separate publish step.

**One extra step for the wiki concern:** after `ymir apply`, if your harness
includes the wiki concern, bootstrap the wiki binary once:

```shell
node "$SKILL_ROOT/hooks/ensure-wiki-binary.mjs"
"$SKILL_ROOT/wiki-cli/bin/wiki" --root ./wiki init --no-hook
```

(`$SKILL_ROOT` is the directory where the skill was installed, e.g.
`.claude/skills/ymir/` for Claude Code.)

**Telemetry:** the skills CLI collects anonymous usage telemetry.
Set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` to opt out.

## Self-report

Ymir runs on your machine, so its failures are invisible to us unless you send
them. When a command crashes, Ymir writes a redacted report to `~/.ymir/` and
tells you it did. **Nothing is sent until you say so:**

```shell
wiki report          # show exactly what would be posted — sends nothing
wiki report --yes    # file it, and opt in to filing future ones automatically
wiki report --off    # opt out and discard everything captured
```

`wiki report` prints the literal issue body, so you can read it before deciding.
Once you opt in, later reports are filed on their own; recurrences comment on the
existing issue rather than opening a new one.

You can also file things Ymir cannot detect itself:

```shell
wiki report --feedback "ymir apply should have a --dry-run"
```

**What a report contains:** the subcommand, error type and message, Ymir's
version, and your OS/arch. Before anything is stored — let alone sent — it is
stripped of filesystem paths, hostnames, email addresses, git remotes and
credential-shaped strings. Paths inside your project keep only their
project-relative part (`<project>/src/auth.ts`); everything else is reduced to a
bare filename. No file contents, and no argument values, are ever included.

**Delivery** uses your own `gh` login, so the issue is filed by you and Ymir
ships no credentials. Without `gh`, you get a prefilled issue URL to open.

**Opting out** — `wiki report --off`, or any of `DO_NOT_TRACK=1`,
`DISABLE_TELEMETRY=1`, `YMIR_REPORT=off`. When off, nothing is captured at all,
not merely withheld. Forks and internal deployments can redirect reports with
`YMIR_REPORT_REPO=owner/name`.

## Status

`v0.6.0`. Ymir runs a codebase-first flow: it scans the repo, then runs a deep
per-concern Socratic interview (probe *why* → recommend → confirm, capturing
`why`/`findings`), a consistency + reflection gate, a spec-review gate, and a spec
emitted to `.ymir/` (`harness-profile.yaml` + `harness-playbook.md`); `ymir apply`
then generates the harness from that spec (with backups + `ymir revert`). The
spec's per-concern playbook sections live in `plugins/ymir/templates/playbook/`;
the interview engine is in `plugins/ymir/references/socratic-interview.md`. The
**rules** concern emits native `.claude/rules/*.md` for Claude Code targets, or
embeds rules inline in `AGENT.md` for agent-neutral harnesses. The **wiki / context**
section drives the bundled wiki tooling (`plugins/ymir/wiki-cli`, templates, and
the PreToolUse hook for Claude Code or a CI gate for other agents). The harness
profile records `target_agent` (claude-code or any) so every concern generates
the right output for the chosen agent.
