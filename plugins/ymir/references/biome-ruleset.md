# Biome Ruleset Guideline

Read this whenever `concerns.lint.tool` is `biome` — during the interview (to ask
the `ruleset` question) and during `ymir apply lint` (to generate the config).
It is the single source of truth for what `concerns.lint.ruleset` means.

## The two values

| `ruleset` | What is on | Pick it when |
|---|---|---|
| `full` (default for biome) | every **stable** rule in every group — `a11y`, `complexity`, `correctness`, `performance`, `security`, `style`, `suspicious` | new or small codebases, and anywhere the point of linting is "catch everything, then opt out on purpose" |
| `recommended` | Biome's recommended subset only | large existing codebases adopting a linter gradually, where a full sweep would bury real findings |

**Nursery rules stay off in both.** They are unstable by definition and change
between releases — enabling them lets a patch upgrade break the build. `full` is
expressed with `"preset": "all"`, which excludes nursery *by design* (Biome
[#9813](https://github.com/biomejs/biome/pull/9813)), so no extra key is needed
to hold them back. Do not write `"nursery": "on"`.

## Version gate — how `full` is expressed

`linter.rules.preset` exists from **Biome 2.5.0**. Detect the version before
writing the config: `npx @biomejs/biome --version`.

- **≥ 2.5.0** — the preset:
  ```json
  { "linter": { "rules": { "preset": "all" } } }
  ```
- **2.0 – 2.4** — no `preset`; turn each group on instead (group-level `"on"`
  means "every rule in this group, at its default severity"):
  ```json
  {
    "linter": {
      "rules": {
        "a11y": "on", "complexity": "on", "correctness": "on",
        "performance": "on", "security": "on", "style": "on", "suspicious": "on"
      }
    }
  }
  ```
  Omit `a11y` for a project with no UI layer (`project.layer: backend`).
- **1.x** — do not generate against it. `all: true` there has different
  semantics; pin `@biomejs/biome` to `^2.5.0` and use the preset.

`ruleset: recommended` needs no `rules` key at all — recommended is the default.

## Baseline config (`ruleset: full`)

Generate `biome.json` — or `biome.jsonc` if the project needs comments to justify
rule exceptions (see below). Pin `$schema` to the version actually installed.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.14/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "linter": {
    "enabled": true,
    "rules": { "preset": "all" },
    "domains": {
      "test": "recommended",
      "qwik": "none",
      "solid": "none",
      "vue": "none",
      "svelte": "none",
      "astro": "none",
      "next": "none",
      "react": "none",
      "reactNative": "none",
      "tailwind": "none",
      "drizzle": "none",
      "playwright": "none",
      "turborepo": "none"
    }
  },
  "formatter": { "enabled": true, "indentStyle": "tab" },
  "javascript": { "formatter": { "quoteStyle": "single" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

- `vcs.useIgnoreFile` reuses `.gitignore` — do not hand-maintain a second ignore
  list in `files.includes`.
- `formatter.indentStyle` ← `concerns.lint.style.indent`;
  `javascript.formatter.quoteStyle` ← `concerns.lint.style.quotes`.
- Biome formats **its own config**. Run `lint:fix` right after writing the file,
  or the first `lint` fails on the config you just generated (a 2-space JSON
  config under `indentStyle: tab` is a formatting error like any other).
- **Assist stays narrow on purpose.** `assist.actions.preset: "all"` also exists,
  but it turns on key/property/attribute sorting, which rewrites source order
  across the repo for no defect-catching gain. `full` means *lint* rules;
  organize-imports is the one assist action worth the churn.

## Domains — the part `full` gets wrong if you skip it

Normally Biome auto-enables a domain's recommended rules from the dependencies it
detects (`react` ≥ 16 in `package.json`, and so on). **`preset: "all"` overrides
that**: every domain's rules turn on whether or not the project uses the
framework. A plain `.js` file in a repo with no Qwik anywhere gets reported by
`correctness/useQwikValidLexicalScope` — verified against 2.5.14. Diagnostics
about a framework the project does not use are the fastest way to make a team
stop reading lint output.

So a `full` config **must** declare domains explicitly:

- Every domain the project does not use → `"none"` (the baseline above lists
  them; keep it in sync with the detected stack).
- Every domain it does use → `"recommended"`, never `"all"` — domain `"all"`
  pulls in that domain's **nursery** rules, contradicting the nursery policy.
- `test: "recommended"` whenever the repo has tests.
- `project` and `types` build a module graph across files — real analysis, real
  slowdown. Enable only if the user accepts a slower lint.
- `react` and `solid` conflict; never enable both.

## Landing `full` on an existing codebase

A full ruleset on code that has never been linted **will** report a lot. That is
the expected first run, not a signal to back off the preset.

1. `npx @biomejs/biome check --write .` — safe fixes and formatting.
2. `npx @biomejs/biome check --write --unsafe .` — review the diff before keeping
   it; unsafe fixes can change behavior.
3. Triage what is left. Fix real findings. For a rule the project genuinely
   rejects, switch off **that one rule** and say why — use `biome.jsonc` so the
   reason lives next to the exception:
   ```jsonc
   {
     "linter": {
       "rules": {
         "preset": "all",
         // Public API mirrors the wire format; renaming would break clients.
         "style": { "useNamingConvention": "off" }
       }
     }
   }
   ```
4. **Never downgrade `preset` to silence a single rule** — that trades one noisy
   rule for every rule the project was never told about.

## Severity — why `full` needs `--error-on-warnings`

Most rules outside the recommended set default to **warn**, and `biome ci` exits
`0` on warnings. A `full` ruleset without a severity gate therefore reports a
great deal and blocks nothing. `preset` sets no severity, so the gate lives in
the command:

```
biome ci .                     # warnings printed, exit 0
biome ci --error-on-warnings . # warnings fail, exit 1
```

The two profile fields stay separate — `ruleset` owns *which rules run*,
`strict` owns *what fails the build*:

| `ruleset` | `strict` | `lint` script |
|---|---|---|
| `full` | `true` | `biome ci --error-on-warnings .` |
| `full` | `false` | `biome ci .` — advisory only; confirm the user really wants a ruleset that cannot fail CI, and record that in `why` |
| `recommended` | `true` | `biome ci --error-on-warnings .` |
| `recommended` | `false` | `biome ci .` |

`ruleset: full` with `strict: false` is a legitimate first step for a large
codebase — but it is a decision, not a default. Raise it in the interview.

## Scripts and verification

Add to `package.json` (or the `project.runtime` equivalent):

```json
{
  "scripts": {
    "lint": "biome ci .",
    "lint:fix": "biome check --write ."
  }
}
```

- `biome ci` is the read-only gate (it has no `--write`/`--fix`);
  `biome check --write` is the local fixer.
- Append `--error-on-warnings` to the `lint` script when `strict: true` — see the
  table above.
- In a CI workflow (the `ci` concern), `biome ci --reporter=github` annotates the
  diff inline.

**Verify:** the `lint` script exits 0 on a clean checkout. That also proves the
installed Biome understands the config — an unsupported key is a hard error, not
a silent skip (Biome 2.4 on `preset` reports *"Found an unknown key `preset`"*
and fails), so a green run rules out a version mismatch silently degrading the
ruleset.
