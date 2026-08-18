---
title: Ymir Apply Design
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/specs/2026-06-17-ymir-apply-design.md
source_path: docs/superpowers/specs/2026-06-17-ymir-apply-design.md
source_hash: ae814d2414e25899f12607d22186971e25f18fe0fd69d9a195e69959d9b1d017
ingested: 2026-08-18
---

# Ymir Apply Design

Design for ymir apply and ymir revert: after the harness-spec reframe, Ymir only emitted a spec under .ymir/ with no way to materialize it. Adds ymir apply, a skill-driven (no new compiled code) procedure that previews a plan table of each in-scope concern's target artifact and state, asks for a single confirmation, then per concern generates/keeps/merges/overwrites (backing up any modified file as <path>.backup.<run-id> before writing), runs every concern's Verify step without fail-fast, and prints a summary table. ymir revert restores the latest run-id's backups. No apply manifest is kept; newly created files have no backup and are left for git to show/clean.
