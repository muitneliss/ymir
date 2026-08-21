# Ymir Self-Report — Implementation Plan

Date: 2026-08-21
Design: `docs/superpowers/specs/2026-08-21-ymir-self-report-design.md`
Branch: `feat/self-report`
Status: Complete

Test-driven throughout: each unit's tests were written and run red before the
implementation existed.

## Unit 1 — Redactor

`wiki-cli/src/report/redact.ts`, `test/report-redact.test.ts` (32 tests).

`redact(text, {cwd})` and `truncate(text, maxChars, maxLines)`. Credentials
first, then identities, then paths. Covers each token shape, emails, SSH
remotes, URL credentials and query strings, POSIX and Windows paths, plus
idempotence and a no-leak property test.

A non-allowlisted URL is replaced whole rather than kept: `ci.acme-corp.internal`
names an employer as surely as a home directory names a user.

## Unit 2 — Model and fingerprint

`wiki-cli/src/report/model.ts`, `test/report-fingerprint.test.ts` (7 tests).

Reuses the existing `sha256Hex` from `src/hash.ts`. Digit runs normalize so
counts do not split one bug. A test pins the stack-independence.

## Unit 3 — Store

`wiki-cli/src/report/store.ts`, `test/report-store.test.ts` (32 tests).

Consent precedence, spool merge and cap, posted map, flush window, JSONL
adoption from hooks. Every path degrades rather than throwing — including an
unwritable home directory.

## Unit 4 — Delivery

`wiki-cli/src/report/github.ts`, `test/report-github.test.ts` (18 tests).

Hermetic via an injected `GhRunner`; no test touches the network. Covers the
fallback URL and its length cap, comment-not-create on a known fingerprint, and
the unlabelled retry for forks without a `self-report` label.

## Unit 5 — Facade and command

`wiki-cli/src/report.ts`, `wiki-cli/src/commands/report.ts`,
`test/report-capture.test.ts` (20) and `test/report-cmd.test.ts` (17).

`runReport` returns `{text, exitCode}`, matching `runStatus`. With no flags it
previews and sends nothing.

## Unit 6 — Error boundary

`wiki-cli/src/cli.ts`, `test/cli-error-boundary.test.ts` (14 tests, subprocess).

Adds `main()`, the `report` command, the opportunistic flush, and the missing
`--version`. Fixes `note --type` to validate instead of throwing a raw ZodError.

Also isolated `test/note.test.ts` from qmd reindex, as #57 did for ingest — the
suite went from 51s with 3 timeouts to 5s green.

## Unit 7 — Hook capture

`plugins/ymir/hooks/ensure-wiki-binary.mjs`, `test/report-hook.test.ts` (6 tests).

Seven duplicated `stderr` + `exit(2)` sites collapse into one `bail()` that also
appends the JSONL record. Respects the opt-out env vars directly, since it runs
before the CLI exists.

## Unit 8 — Docs

`README.md` (what a report contains, opt-out), `plugins/ymir/SKILL.md` (how
Claude files skill-flow failures), `wiki/SCHEMA.md` and `src/commands/help.ts`
(command reference), plus this plan and its design doc, all re-ingested into the
wiki.

## Verification

- `bun run typecheck && bun test && bun run build` — 398 pass, 0 fail.
- Compiled a real `bun --compile` binary and confirmed: the old ZodError dump is
  now one line; a genuine crash spools; four crashes merge to one record with
  `occurrences: 4`; opt-out discards and stops capture; `DO_NOT_TRACK` creates no
  state at all; no `gh` yields a working prefilled URL.
- Adversarial redaction pass leaked none of: real username, `ghp_` token, email,
  secret query value, internal hostname.
- Installed skill payload unchanged at 15 files (CI budget 20).
