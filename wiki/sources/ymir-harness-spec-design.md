---
title: Ymir Harness Spec Design
type: source
date: 2026-08-18
tags: []
source: docs/superpowers/specs/2026-06-17-ymir-harness-spec-design.md
source_path: docs/superpowers/specs/2026-06-17-ymir-harness-spec-design.md
source_hash: 1979cc369ea46649ce855fd2495aa2bd408795eee45651ce00576393447835cb
ingested: 2026-08-18
---

# Ymir Harness Spec Design

Design reframing Ymir from a two-step scaffolder into a three-step harness-spec generator: Step 1 runs a checklist-driven socratic interview across project/techstack plus five concerns (rules, lint, CI lint, wiki/context, CLAUDE.md); Step 2 is a re-audit gate that loops back on any missing required field and prints a coverage table; Step 3 emits exactly two files under .ymir/ — harness-profile.yaml (audited decisions with a status per concern) and harness-playbook.md (per-concern Inputs/Steps/Verify assembled from bundled playbook-section templates). The skill writes no harness files itself, with a single exception: the wiki-only intent (ymir add context/add wiki) still executes the wiki scaffold directly.
