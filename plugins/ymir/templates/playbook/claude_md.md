## CLAUDE.md / AGENT.md → steering file

- **Inputs:** `concerns.claude_md.steer[]`, plus the other captured concerns
- **Steps:**
  1. Create or extend `CLAUDE.md` at the project root.
  2. For each `steer[]` point, add a short directive — e.g. `point-to-rules`
     links `docs/rules.md`; `point-to-wiki` links `wiki/SCHEMA.md`;
     `lint-before-commit` tells Claude to run the lint command before commits.
- **Verify:** `CLAUDE.md` exists and references every captured concern's artifact.
