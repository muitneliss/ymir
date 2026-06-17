## lint → linter config

- **Target:** the linter config for `concerns.lint.tool` — use `concerns.lint.config` if the profile sets it, else the tool's conventional file (`eslint` → `eslint.config.{mjs,js,cjs}` / `.eslintrc*`; `biome` → `biome.json` / `biome.jsonc`; `golangci-lint` → `.golangci.{yml,yaml}`; `ruff` → `ruff.toml` / `pyproject.toml`)
- **Inputs:** `project.language`, `project.runtime`, `concerns.lint.tool`,
  `concerns.lint.strict`, `concerns.lint.style`
- **Steps:**
  1. Generate the config file for `concerns.lint.tool` (e.g. `biome.json`,
     `.golangci.yml`) using `strict` and `style`.
  2. Add a `lint` (and `lint:fix` where supported) script/target appropriate to
     `project.runtime`.
- **Verify:** the lint command runs clean on a fresh checkout.
