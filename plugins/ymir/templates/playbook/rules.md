## rules → project rules doc

- **Target:** `docs/rules.md` (or the project's existing conventions doc)
- **Inputs:** `concerns.rules.obey[]`, `concerns.rules.avoid[]`
- **Steps:**
  1. Create `docs/rules.md` (or the project's existing conventions doc).
  2. Add a top **"NEVER"** list — one bullet per `avoid[]` item.
  3. Add sections (Naming, Error handling, Module boundaries) phrased from the
     `obey[]` items.
- **Verify:** `docs/rules.md` exists; every `avoid[]` item appears in the NEVER
  list.
