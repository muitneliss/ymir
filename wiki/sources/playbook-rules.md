---
title: Playbook Rules
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/rules.md
source_path: plugins/ymir/templates/playbook/rules.md
source_hash: eb86ea207a2ce3f6a30f34a1615a19decf64c9ddef068837efa03421f3a5fc6b
ingested: 2026-08-18
---

# Playbook Rules

Playbook section template for the rules concern, targeting the .claude/rules/ directory (native path-scoped Claude Code rules) rather than a single docs/rules.md. Opens with a Why/Findings placeholder block, takes concerns.rules.files[] as Inputs (each entry {name, paths?, obey[], avoid[]}), and its Steps create one .claude/rules/<name>.md per entry, adding YAML paths: frontmatter when the entry is scoped (omitted for an always-on rule), a NEVER list from avoid[], and sections phrased from obey[]. Verify checks every files[] entry has a matching file, scoped entries' frontmatter matches the profile, and every avoid[] item appears in its file's NEVER list.
