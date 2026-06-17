# Harness Profile — Shape & Required Fields

`.ymir/harness-profile.yaml` records the audited interview decisions. Ymir writes
it; the re-audit gate checks it. It is the machine-readable half of the harness
spec (the LLM-facing half is `.ymir/harness-playbook.md`).

## Top level

| Key | Required | Notes |
|---|---|---|
| `meta.project` | yes | base name of the project directory |
| `meta.generated_by` | yes | always `ymir` |
| `meta.generated_at` | yes | ISO date (YYYY-MM-DD) |
| `meta.spec_version` | yes | integer; `1` for this schema |
| `project.language` | yes | e.g. `typescript`, `go` |
| `project.layer` | yes | `frontend` \| `backend` \| `both` |
| `project.runtime` | recommended | e.g. `bun`, `node`, or omit if none |
| `project.host` | recommended | repo host → drives CI provider (e.g. `github`) |
| `concerns.<name>.status` | yes | one of the statuses below |

## Concern statuses

- `captured` — interviewed; the required fields below are present.
- `skipped` — user chose not to set this concern up; include a `reason`.
- `pending` — raised but unresolved. **The audit blocks emission while any
  in-scope concern is `pending`.**

## Required fields per concern (only when `status: captured`)

| Concern | Required when captured |
|---|---|
| `rules` | at least one of `obey[]` / `avoid[]` (or both empty with a `note: "no special rules"`) |
| `lint` | `tool` |
| `ci` | `provider`, `runs[]` |
| `wiki` | `enabled`; and if `enabled: true`, then `collection` |
| `claude_md` | `steer[]` |

## Example

```yaml
meta:    { project: acme-api, generated_by: ymir, generated_at: 2026-06-17, spec_version: 1 }
project: { language: typescript, runtime: bun, layer: backend, host: github }
concerns:
  rules:     { status: captured, obey: [functional-core-imperative-shell, explicit-return-types], avoid: [any, default-exports, throw-as-control-flow] }
  lint:      { status: captured, tool: biome, strict: true, style: { indent: tab, quotes: single } }
  ci:        { status: captured, provider: github-actions, runs: [lint] }
  wiki:      { status: captured, enabled: true, collection: acme-api-wiki }
  claude_md: { status: captured, steer: [point-to-rules, point-to-wiki, lint-before-commit] }
```
