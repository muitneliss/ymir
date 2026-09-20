## CI lint → CI workflow

- **Why / Findings:** {{CI_WHY}} — repo scan: {{CI_FINDINGS}}. Considered: {{CI_ALTERNATIVES}}.
- **Target:** the CI workflow for `concerns.ci.provider` — use `concerns.ci.workflow` if the profile sets it, else the provider's conventional file (`.github/workflows/` for GitHub Actions, `.gitlab-ci.yml` for GitLab CI, `.circleci/config.yml` for CircleCI)
- **Inputs:** `project.host`, `project.runtime`, `concerns.ci.provider`,
  `concerns.ci.runs[]`, `concerns.taskfile.status`, `concerns.taskfile.tasks[]`
- **Steps:**
  1. Create the CI workflow for `concerns.ci.provider` (e.g.
     `.github/workflows/ci.yml` for GitHub Actions).
  2. Add a job that installs deps for `project.runtime` and runs each entry in
     `concerns.ci.runs[]` (e.g. `lint`).
  3. **If `concerns.taskfile.status` is `captured`**, run each entry as
     `task <name>` instead of repeating its command — install Task first
     (GitHub Actions: `uses: go-task/setup-task@v1` with `version: 3.x`; other
     providers: the install script in `references/taskfile.md`). CI must not hold
     its own copy of a command the Taskfile already owns.
- **Verify:** the workflow file is valid YAML and runs the same lint command the
  `lint` concern produced — via `task lint` when the `taskfile` concern is
  captured.
