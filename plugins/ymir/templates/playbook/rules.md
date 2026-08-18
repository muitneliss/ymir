## rules → native rules files (Claude Code) or `AGENT.md` sections (other agents)

- **Why / Findings:** {{RULES_WHY}} — repo scan: {{RULES_FINDINGS}}. Considered: {{RULES_ALTERNATIVES}}.
- **Inputs:** `concerns.rules.files[]` (each `{name, paths?, obey[], avoid[]}`), `target_agent.value`

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
  - **Verify:** every `files[]` entry has a matching `.claude/rules/<name>.md`; each
    scoped entry's frontmatter `paths` matches the profile; every `avoid[]` item
    appears in its file's NEVER list.

**`any` (non-Claude target)** — do NOT write `.claude/rules/`. Rules are embedded
  directly in `AGENT.md` by the `claude_md` playbook section. This section has
  no independent output for non-Claude targets — skip it and proceed to `claude_md`.
