---
title: Playbook Wiki
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/wiki.md
source_path: plugins/ymir/templates/playbook/wiki.md
source_hash: e38c30a587bf0339f815ec88d205cd62211d6b89f83956e6b7474125fce029c1
ingested: 2026-08-18
---

# Playbook Wiki

Playbook section template for the wiki/context concern. Opens with a Why/Findings placeholder block, targets the wiki/ tree plus .claude/hooks/block-wiki-edits.mjs, and takes concerns.wiki.enabled/collection and meta.project as Inputs. Its single Step runs the idempotent wiki init CLI call (the CLI owns the tree, PreToolUse hook, settings.json entry, CLAUDE.md block, and validation), then tells the user the one-time qmd collection add setup for BM25 keyword search (no qmd embed). Verify requires wiki --root ./wiki validate to print "wiki valid".
