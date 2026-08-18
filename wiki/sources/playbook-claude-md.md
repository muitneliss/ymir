---
title: Playbook Claude MD
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/claude_md.md
source_path: plugins/ymir/templates/playbook/claude_md.md
source_hash: eeb5da62de75a694d059aefea1274745fb6600012c5b9dc55f359f2d29ddaf4a
ingested: 2026-08-18
---

# Playbook Claude MD

Playbook section template for the CLAUDE.md/AGENT.md steering-file concern. Opens with a Why/Findings placeholder block, targets CLAUDE.md (or AGENT.md) at the project root, takes concerns.claude\_md.steer[] as input, and its Steps create/extend the file with one directive per steer point (e.g. point-to-wiki, lint-before-commit) while explicitly forbidding a point-to-rules steer since .claude/rules/ auto-loads. Verify checks the file exists and references the captured concerns it should steer toward without pointing at .claude/rules/.
