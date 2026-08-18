---
title: Playbook Header
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/header.md
source_path: plugins/ymir/templates/playbook/header.md
source_hash: e2cda4bc6b367b09a0279949a599672f3d481937c83f9c182a2b9461d4790dcb
ingested: 2026-08-18
---

# Playbook Header

The header template prepended to every generated harness-playbook.md, with {{PROJECT}} and {{DATE}} placeholders. States that Ymir itself wrote no harness files — only this playbook and harness-profile.yaml — and explains how to use the document: read the profile for decisions, then follow each concern's Inputs/Steps/Verify section. Notes that each section opens with a Why/Findings line recording rationale and what the codebase scan saw, which is context, not an executable action.
