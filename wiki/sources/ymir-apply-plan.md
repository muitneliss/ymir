---
title: Ymir Apply Plan
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/plans/2026-06-17-ymir-apply.md
source_path: docs/superpowers/plans/2026-06-17-ymir-apply.md
source_hash: 91593146dfd3d62105cec5be80e026becdc70c57108197529c0814da1dd03af4
ingested: 2026-08-18
---

# Ymir Apply Plan

Implementation plan for ymir apply/revert: adds a machine-readable **Target:** bullet to every playbook section template so the apply preview scan can detect whether an artifact already exists, then adds the Applying the spec section to SKILL.md (load+preview, confirm once, capture one run-id, execute each concern via keep/merge/overwrite with backups, verify all, print summary) and the Reverting an apply section (restore the latest run-id's \*.backup.<run-id> files), followed by reframing README.md and plugin.json to surface the new apply/revert intents.
