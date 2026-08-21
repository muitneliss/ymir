---
title: Ymir Self-Report Design
type: source
date: 2026-08-21
tags: []
source: docs/superpowers/specs/2026-08-21-ymir-self-report-design.md
source_path: docs/superpowers/specs/2026-08-21-ymir-self-report-design.md
source_hash: b60ec79e2e497aaedcb9ef9b89f924ab6f6a58cdb1482247ea7eb0f8c335524d
ingested: 2026-08-21
---

# Ymir Self-Report Design

Design for capturing Ymir's failures on end-user machines and filing them as
deduplicated GitHub issues.

The problem is that Ymir ships to other people's machines, so its failures are
invisible upstream. The failure experience made this worse: `cli.ts` ended in a
bare `program.parseAsync()` with no top-level handler, so any async throw escaped
as an unhandled rejection — measured on the shipped compiled binary, an invalid
`--type` produced an eleven-line ZodError dump and no stack frames at all,
because `bun build --compile` emits none.

Key decisions. Consent is opt-in once then automatic, defaulting to off, honoring
`DO_NOT_TRACK`, `DISABLE_TELEMETRY` and `YMIR_REPORT=off`; when off, nothing is
captured at all rather than captured-but-withheld. The crash path only writes to
disk, never the network, so a crashing CLI cannot also hang on `gh`. Delivery is
an opportunistic flush inside the CLI rather than a SessionStart hook, which adds
no payload file and still works for skills-CLI installs on non-Claude agents.
Identity is a fingerprint over kind, command, error name and digit-normalized
message, deliberately excluding the stack because compiled frames are
build-specific offsets. Dedup consults a local fingerprint-to-issue map before
any GitHub search, because the search index trails issue creation and a
search-first design would file duplicates for the length of the lag.

Five units live inside the wiki CLI so the plugin payload is unchanged: a pure
redactor, the report model, the `~/.ymir` store, the `gh` delivery layer modeled
on `reindex.ts`'s never-throwing subprocess pattern, and a facade plus command.
Redaction runs before fingerprinting, which keeps the spool safe to read and
makes one bug fingerprint identically on every machine.

The error boundary reports only what it did not predict. Building it surfaced two
root-cause bugs it would otherwise have papered over: `note --type` threw a raw
ZodError for plain user error, and the `"<command> rejected:"` message-prefix
convention gave callers no way to tell a refusal from a crash except by matching
text — now a `Rejection` type.

See [[Ymir Self-Report Plan]] for the implementation sequence,
[[Wiki CLI Command Surface]] for the command it adds, and [[Ymir README]] for the
user-facing contract.
