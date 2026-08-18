## CLAUDE.md / AGENT.md → steering file

- **Why / Findings:** {{CLAUDE_MD_WHY}} — repo scan: {{CLAUDE_MD_FINDINGS}}. Considered: {{CLAUDE_MD_ALTERNATIVES}}.
- **Inputs:** `concerns.claude_md.steer[]`, `target_agent.value`, plus the other captured concerns

Branch on `target_agent.value`:

**`claude-code`** — write `CLAUDE.md` at the project root.
  - For each `steer[]` point, add a short directive — e.g. `point-to-wiki`
    links `wiki/SCHEMA.md`; `lint-before-commit` tells Claude to run the lint
    command before commits.
  - Do NOT add a pointer to `.claude/rules/` — Claude Code auto-discovers those;
    a `point-to-rules` steer is redundant.
  - **Verify:** `CLAUDE.md` exists and references the captured steer concerns
    (wiki, lint), without pointing at `.claude/rules/`.

**`any` (non-Claude target)** — write `AGENT.md` at the project root instead.
  - Embed rules directives inline (agents don't auto-load `.claude/rules/`):
    for each `rules.files[]` entry, add a section with its `obey[]`/`avoid[]`
    content directly in `AGENT.md`. Omit any reference to `.claude/rules/`.
  - For each `steer[]` point, add the same short directive as above.
  - **Verify:** `AGENT.md` exists and embeds all rules content plus steer directives.
    No `CLAUDE.md` or `.claude/rules/` files are written.
