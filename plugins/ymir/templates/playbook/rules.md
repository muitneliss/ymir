## rules → `.claude/rules/` (native path-scoped rules)

- **Why / Findings:** {{RULES_WHY}} — repo scan: {{RULES_FINDINGS}}. Considered: {{RULES_ALTERNATIVES}}.
- **Target:** the `.claude/rules/` directory (one `<name>.md` file per `concerns.rules.files[]` entry)
- **Inputs:** `concerns.rules.files[]` (each `{name, paths?, obey[], avoid[]}`)
- **Steps:**
  1. For each entry in `concerns.rules.files[]`, create `.claude/rules/<name>.md`.
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
