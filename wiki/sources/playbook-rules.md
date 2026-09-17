---
title: Playbook Rules
type: source
date: 2026-09-17
tags: []
source: plugins/ymir/templates/playbook/rules.md
source_path: plugins/ymir/templates/playbook/rules.md
source_hash: ea4957427aaf5b37964f401f9729002bde2215d808003b239d8b9a34209ae0b3
ingested: 2026-09-17
---

# Playbook Rules

## rules → native rules files (Claude Code) or `AGENT.md` sections (other agents)

* **Why / Findings:** {{RULES\_WHY}} — repo scan: {{RULES\_FINDINGS}}. Considered: {{RULES\_ALTERNATIVES}}.
* **Target:** when `target_agent.value` is `claude-code`, the directory `.claude/rules/` — each `concerns.rules.files[]` entry is its own artifact (`.claude/rules/<name>.md`), so test, ask keep/merge/overwrite, and back up **per file**. When it is `any`, this section has no target of its own: the rules are written into `AGENT.md` by the `claude_md` section, so plan nothing here.
* **Inputs:** `concerns.rules.files[]` (each `{name, paths?, obey[], avoid[]}`), `target_agent.value`

Branch on `target_agent.value`:

**`claude-code`** — write one `.claude/rules/<name>.md` per `files[]` entry.

1. For each entry, create `.claude/rules/<name>.md`.
2. If the entry has `paths`, add YAML frontmatter listing each glob:

   ```markdown
   ---
   paths:
     - "<glob>"
   ---
   ```

   If it has no `paths`, write no frontmatter (always-on rule).
3. Add a top **"NEVER"** list — one bullet per `avoid[]` item.
4. Add sections (Naming, Error handling, Module boundaries) phrased from the
   `obey[]` items.

* **Verify:** every `files[]` entry has a matching `.claude/rules/<name>.md`; each
  scoped entry's frontmatter `paths` matches the profile; every `avoid[]` item
  appears in its file's NEVER list.

**`any` (non-Claude target)** — do NOT write `.claude/rules/`. Rules are embedded
directly in `AGENT.md` by the `claude_md` playbook section. This section has
no independent output for non-Claude targets — skip it and proceed to `claude_md`.
