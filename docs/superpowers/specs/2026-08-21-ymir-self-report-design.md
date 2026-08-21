# Ymir Self-Report: capture failures and file them upstream — Design

Date: 2026-08-21
Status: Implemented
Branch: `feat/self-report`

## Problem

Ymir ships to other people's machines as a Claude Code plugin and as an agent
skill via `npx skills add`. When it breaks there, nothing comes back — the
maintainers only learn about failures someone bothers to report by hand, which
in practice means almost none of them.

The failure experience made this worse. `wiki-cli/src/cli.ts` ended with a bare
`program.parseAsync()` and no top-level handler, so anything an async action
threw escaped as an unhandled rejection. Measured against the shipped compiled
binary, `wiki note --type bogus` produced an eleven-line `ZodError` JSON dump
followed by `Bun v1.3.14 (macOS arm64)` — and no stack frames at all, because
`bun build --compile` emits none. The user saw noise; the project saw nothing.

## Goal

A failure on a user's machine becomes a deduplicated GitHub issue on
`muitneliss/ymir`, with the user's informed consent, carrying enough to diagnose
and nothing that identifies them.

## Non-Goals (YAGNI)

- No hosted ingest service and no shipped credential. Delivery borrows the user's
  own `gh` login.
- No background daemon and no new SessionStart hook.
- No usage analytics. This reports *failures and feedback*, never behaviour.
- No automatic capture of user error. A bad flag is the CLI working.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Consent | Opt in once, automatic after; default off | The user asked for "auto post"; publishing a stranger's error data to a public tracker unasked is not defensible |
| Opt-out | `--off`, `DO_NOT_TRACK`, `DISABLE_TELEMETRY`, `YMIR_REPORT=off` | The README already promises the first two for the skills CLI |
| When off | Capture nothing at all | Withholding-but-storing is not what "off" means to a user |
| Crash path | Spool to disk only, never network | A crashing CLI must not also hang on `gh` |
| Delivery trigger | Opportunistic flush inside the CLI | Needs no payload file, and works for skills-CLI installs on non-Claude agents where Claude Code hooks never run |
| Identity | `sha256(kind, command, errorName, digit-normalized message)` | The compiled binary's frames are build-specific offsets; a stack-based identity is unstable or empty |
| Dedup | Local `fingerprint → issue` map first, GitHub search second | GitHub's search index trails creation, so search-first would file duplicates for the length of the lag |
| Destination | `muitneliss/ymir`, overridable via `YMIR_REPORT_REPO` | Forks still feed upstream; internal deployments can redirect |
| Hook failures | Append JSONL, let the CLI complete it | A `.mjs` hook cannot import TS, and copying the pipeline in would repeat the `platform.ts` drift |

## Architecture

Five units inside `wiki-cli/`, so the plugin payload is unchanged (the CI
`skills-install` job caps the installed skill at 20 files; it stays at 15).

1. **`src/report/redact.ts`** — pure, no I/O. Denies by default on paths,
   hostnames and credential shapes. Rule order is load-bearing: credentials
   first, so a token buried in a path or query dies whatever encloses it; paths
   last, because they are greediest.
2. **`src/report/model.ts`** — the `Report` shape and `fingerprint()`.
3. **`src/report/store.ts`** — all `~/.ymir` state: consent, spool, posted map,
   flush window. Nothing here throws; every read tolerates corruption.
4. **`src/report/github.ts`** — delivery. Injectable `GhRunner`, modelled on
   `reindex.ts`'s never-throwing subprocess pattern. Falls back to a prefilled
   `issues/new?…` URL when `gh` is missing or logged out.
5. **`src/report.ts`** — the facade (`capture`, `flush`, `maybeFlush`) plus
   `src/commands/report.ts` for the command.

### Redact-then-fingerprint

Redaction runs *before* the fingerprint is computed. This is load-bearing twice:
it keeps the on-disk spool safe to read, and it makes one bug fingerprint
identically on every machine. Fingerprinting the raw message would fold each
user's home directory into the identity, so the same crash would arrive as a
fresh issue from every person who hit it.

### The error boundary

`main()` wraps `parseAsync` and is the single place a failure becomes a message.
Only genuine exceptions are captured; the inline `process.exit(1)` validation
paths are correct behaviour, and reporting them would bury real bugs under
everyone's typos.

Fixing the boundary exposed a root-cause bug it would otherwise have papered
over: `note --type` used `NoteType.parse`, throwing a raw `ZodError` for what is
plain user error. It now validates with `safeParse` and prints one clear line.

## What a report contains

Subcommand, error name, redacted message and stack, flag *names*, Ymir version
(from the `.version` stamp beside the executable), and OS/arch. Never argument
values, file contents, or absolute paths — project paths keep only their
relative tail (`<project>/src/auth.ts`), everything else becomes `<path>/name`.

## Verification

Seven test files, 398 tests green. The adversarial pass matters most: a report
synthesized from a real home path, a `ghp_` token, an email and an internal URL
leaks none of them into the stored bytes.
