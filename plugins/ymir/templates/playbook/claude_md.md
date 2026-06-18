## CLAUDE.md / AGENT.md → steering file

- **Why / Findings:** {{CLAUDE_MD_WHY}} — repo scan: {{CLAUDE_MD_FINDINGS}}. Considered: {{CLAUDE_MD_ALTERNATIVES}}.
- **Target:** `CLAUDE.md` (or `AGENT.md`) at the project root
- **Inputs:** `concerns.claude_md.steer[]`, plus the other captured concerns
- **Steps:**
  1. Create or extend `CLAUDE.md` at the project root.
  2. For each `steer[]` point, add a short directive — e.g. `point-to-wiki`
     links `wiki/SCHEMA.md`; `lint-before-commit` tells Claude to run the lint
     command before commits. Do NOT add a pointer to `.claude/rules/` — Claude
     Code auto-discovers those; a `point-to-rules` steer is redundant.
- **Verify:** `CLAUDE.md` exists and references the captured concerns it should
  steer toward (wiki, lint), without pointing at `.claude/rules/`.
