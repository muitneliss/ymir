---
title: Playbook Header
type: source
date: 2026-09-17
tags: []
source: plugins/ymir/templates/playbook/header.md
source_path: plugins/ymir/templates/playbook/header.md
source_hash: d0ba291290713b731914957fa60a006a062e581b90e7bc88f563883f5c7c6a0c
ingested: 2026-09-17
---

# Playbook Header

The header template prepended to every generated harness-playbook.md, with {{PROJECT}} and {{DATE}} placeholders. States that Ymir itself wrote no harness files — only this playbook and harness-profile.yaml — and explains how to use the document: read the profile for decisions, then follow each concern's Target/Inputs/Steps/Verify section. Notes that each section opens with a Why/Findings line recording rationale and what the codebase scan saw, which is context, not an executable action.
