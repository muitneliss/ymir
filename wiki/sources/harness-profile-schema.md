---
title: Harness Profile Schema
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/harness-profile.schema.md
source_path: plugins/ymir/templates/harness-profile.schema.md
source_hash: 83bddeed61d0937d6af4bc2b831109afde4b66cda8ed920fcf671b260be7c679
ingested: 2026-08-18
---

# Harness Profile Schema

Schema reference for .ymir/harness-profile.yaml, the machine-readable half of the harness spec (the LLM-facing half is harness-playbook.md). Documents required top-level keys (meta.project, generated\_by, generated\_at, spec\_version=2, project.language/layer/runtime/host, concerns.<name>.status), the three statuses (captured/skipped/pending, with pending blocking spec emission), required fields per concern when captured (including why and findings on every concern), and the rules.files[] shape mapping each entry to a .claude/rules/<name>.md file with optional paths frontmatter. Includes the v1-to-v2 migration note and a full example profile.
