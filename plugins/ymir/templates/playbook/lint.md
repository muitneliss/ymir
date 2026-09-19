## lint → linter config

- **Why / Findings:** {{LINT_WHY}} — repo scan: {{LINT_FINDINGS}}. Considered: {{LINT_ALTERNATIVES}}.
- **Target:** the linter config for `concerns.lint.tool` — use `concerns.lint.config` if the profile sets it, else the tool's conventional file (`eslint` → `eslint.config.{mjs,js,cjs}` / `.eslintrc*`; `biome` → `biome.json` / `biome.jsonc`; `golangci-lint` → `.golangci.{yml,yaml}`; `ruff` → `ruff.toml` / `pyproject.toml`)
- **Inputs:** `project.language`, `project.runtime`, `project.layer`,
  `concerns.lint.tool`, `concerns.lint.ruleset` (biome), `concerns.lint.strict`,
  `concerns.lint.style`
- **Steps:**
  1. Generate the config file for `concerns.lint.tool` from `ruleset`, `strict`
     and `style`.
  2. **If the tool is `biome`, follow `references/biome-ruleset.md`** (relative to
     the Ymir skill root) — it is the source of truth for how `ruleset` is
     expressed per Biome version, the nursery/domain policy, and the severity
     gate. Do not improvise a rule list. In short, for `ruleset: full` on
     Biome ≥ 2.5:
     ```json
     { "linter": { "rules": { "preset": "all" } } }
     ```
     `preset` excludes nursery by design, and does not exist before 2.5.0 — check
     `biome --version` first and fall back to per-group `"on"` as the reference
     describes. For `ruleset: recommended`, write no `rules` key at all.
  3. Settle the command. For biome the gate is the command, not the config: rules
     outside the recommended set default to *warn* and `biome ci` exits 0 on
     warnings, so `strict: true` means `biome ci --error-on-warnings .`. If
     `concerns.taskfile.status` is `captured`, that command belongs in the
     `lint` task and nowhere else — do not also add a `package.json` script for
     it. Otherwise add a `lint` (and `lint:fix` where supported) script/target
     appropriate to `project.runtime`.
  4. Land the config on the code that already exists: run the fixer
     (`lint:fix`), then triage what remains. Turn off a single offending rule
     with a written reason before weakening the ruleset as a whole.
- **Verify:** the `lint` command runs clean on a fresh checkout.
