---
title: Harness Profile Schema
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/harness-profile.schema.md
source_path: plugins/ymir/templates/harness-profile.schema.md
source_hash: 45ba78324b3bf4313f2fa1dec2a90e72a03a10d4714d32d0fd3592d4fea33e82
ingested: 2026-08-18
---

# Harness Profile Schema

# Harness Profile — Shape & Required Fields

`.ymir/harness-profile.yaml` records the audited interview decisions. Ymir writes
it; the re-audit gate checks it. It is the machine-readable half of the harness
spec (the LLM-facing half is `.ymir/harness-playbook.md`).

## Top level

| Key                      | Required    | Notes                                                |
| ------------------------ | ----------- | ---------------------------------------------------- |
| `meta.project`           | yes         | base name of the project directory                   |
| `meta.generated_by`      | yes         | always `ymir`                                        |
| `meta.generated_at`      | yes         | ISO date (YYYY-MM-DD)                                |
| `meta.spec_version`      | yes         | integer; `2` for this schema                         |
| `project.language`       | yes         | e.g. `typescript`, `go`                              |
| `project.layer`          | yes         | `frontend` \| `backend` \| `both`                    |
| `project.runtime`        | recommended | e.g. `bun`, `node`, or omit if none                  |
| `project.host`           | recommended | repo host → drives CI provider (e.g. `github`)       |
| `target_agent.value`     | yes         | `claude-code` or `any` (see below)                   |
| `target_agent.why`       | yes         | rationale for the choice                             |
| `target_agent.findings`  | yes         | what the scan saw; `claude-code` / `any` / `unknown` |
| `concerns.<name>.status` | yes         | one of the statuses below                            |

## `target_agent` — which AI agent runs harness files

Captured as an audited decision before any concern is generated. Shapes the
entire harness:

| Value         | Steering file | Rules location       | Wiki guard                                                         |
| ------------- | ------------- | -------------------- | ------------------------------------------------------------------ |
| `claude-code` | `CLAUDE.md`   | `.claude/rules/*.md` | PreToolUse hook (`block-wiki-edits.mjs`) + `.claude/settings.json` |
| `any`         | `AGENT.md`    | Inline in `AGENT.md` | CI gate (`wiki check --error-on-untracked-sources`)                |

`claude-code` produces today's harness unchanged.
`any` skips all Claude Code–specific files (`.claude/` hooks, settings) and
replaces the wiki PreToolUse guard with a CI gate using the existing
`wiki check` command — enforcement that works regardless of which agent runs.

## Concern statuses

* `captured` — interviewed; the required fields below are present.
* `skipped` — user chose not to set this concern up; include a `reason`.
* `pending` — raised but unresolved. **The audit blocks emission while any
  in-scope concern is `pending`.**

## Required fields per concern (only when `status: captured`)

Every captured concern additionally requires `why` (string — the pain/goal the
user expressed) and `findings` (string — what the Step 0 codebase scan saw + a
verdict of `present-strong` / `present-weak` / `missing`). `alternatives_considered`
(list) is recommended.

| Concern     | Required when captured (besides `why` + `findings`)                                              |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `rules`     | at least one `files[]` entry; each entry needs a `name` and at least one of `obey[]` / `avoid[]` |
| `lint`      | `tool`                                                                                           |
| `ci`        | `provider`, `runs[]`                                                                             |
| `wiki`      | `enabled`; and if `enabled: true`, then `collection`                                             |
| `claude_md` | `steer[]`                                                                                        |

## `rules.files[]` — one native `.claude/rules/` file per entry

Each entry maps to `.claude/rules/<name>.md`:

| Key     | Required | Notes                                                                                                             |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`  | yes      | kebab-case; becomes the filename (`<name>.md`)                                                                    |
| `paths` | no       | YAML list of globs (e.g. `["src/**/*.{ts,tsx}"]`). Omit for an always-on rule (loads at launch like `CLAUDE.md`). |
| `obey`  | —        | conventions to follow (≥1 of `obey`/`avoid` required)                                                             |
| `avoid` | —        | patterns to ban (rendered as a "NEVER" list)                                                                      |

**v1 → v2 migration:** a v1 profile's flat `rules.obey`/`rules.avoid` upgrades to a
single always-on `files[]` entry named `project-conventions` (no `paths`). Absent
`why`/`findings` are treated as gaps to fill on resume; the next emit writes
`spec_version: 2`.

## Example

```yaml
meta:    { project: acme-api, generated_by: ymir, generated_at: 2026-06-18, spec_version: 2 }
project: { language: typescript, runtime: bun, layer: backend, host: github }
target_agent:
  value: claude-code
  why: "team uses Claude Code exclusively"
  findings: "claude-code — .claude/ directory present"
concerns:
  rules:
    status: captured
    files:
      - name: typescript-conventions      # → .claude/rules/typescript-conventions.md
        paths: ["src/**/*.{ts,tsx}"]       # omit `paths` for an always-on rule
        obey: [functional-core-imperative-shell, explicit-return-types]
        avoid: [any, default-exports]
      - name: testing
        paths: ["**/*.test.ts"]
        obey: [arrange-act-assert]
    why: "encode the conventions Claude keeps violating, scoped so they load only when relevant"
    findings: "present-weak — conventions implied in code but undocumented; no .claude/rules/"
    alternatives_considered: [single-CLAUDE.md-section, docs/rules.md]
  lint:
    status: captured
    tool: biome
    strict: true
    style: { indent: tab, quotes: single }
    why: "catch real bugs + kill mixed quote styles without config overhead"
    findings: "missing — no linter config; src/ mixes single+double quotes"
    alternatives_considered: [eslint+prettier]
  ci:        { status: captured, provider: github-actions, runs: [lint], why: "block PRs that fail lint", findings: "missing — no workflows" }
  wiki:      { status: captured, enabled: true, collection: acme-api-wiki, why: "shared project knowledge for Claude", findings: "missing" }
  claude_md: { status: captured, steer: [point-to-wiki, lint-before-commit], why: "steer Claude to wiki + lint gate", findings: "present-weak — thin CLAUDE.md" }
```
