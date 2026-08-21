---
title: Ymir Self-Report Plan
type: source
date: 2026-08-21
tags: []
source: docs/superpowers/plans/2026-08-21-ymir-self-report.md
source_path: docs/superpowers/plans/2026-08-21-ymir-self-report.md
source_hash: 830dba31841954535b4629f2aa46b6ac98335b514ad06784e4ce5b94eef6494c
ingested: 2026-08-21
---

# Ymir Self-Report Plan

Test-driven implementation sequence for Ymir's self-report, in eight units, each
written red before the implementation existed.

Unit 1 is the redactor (32 tests): credentials first so a token buried in a path
or query dies whatever encloses it, then identities, then paths last because they
are greediest. A non-allowlisted URL is replaced whole, since an internal
hostname names an employer as surely as a home directory names a user. Unit 2 is
the model and fingerprint, reusing the existing `sha256Hex`. Unit 3 is the
`~/.ymir` store, where every path degrades rather than throwing, including an
unwritable home directory. Unit 4 is delivery, hermetic via an injected
`GhRunner` so no test touches the network. Unit 5 is the facade and the
`wiki report` command, returning `{text, exitCode}` to match `runStatus`.

Unit 6 is the error boundary, which also fixed `note --type` to validate rather
than throw a raw ZodError, and isolated the note tests from qmd reindex as an
earlier change had for ingest — the suite went from 51 seconds with three
timeouts to under 5 seconds green. Unit 7 moves the seven duplicated
`stderr` + `exit(2)` sites in the install hook into one `bail()` that also
appends a JSONL record. Unit 8 is documentation.

Verification covered the compiled binary, not just the source: the old ZodError
dump is now one line, four repeated crashes merge into one record with an
occurrence count, opt-out discards and halts capture, `DO_NOT_TRACK` creates no
state at all, and an adversarial payload carrying a real username, a token, an
email, a secret query value and an internal hostname leaked none of them.

See [[Ymir Self-Report Design]] for the rationale and [[Wiki CLI Command Surface]]
for the resulting command set.
