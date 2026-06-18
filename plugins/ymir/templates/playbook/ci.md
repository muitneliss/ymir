## CI lint → CI workflow

- **Target:** the CI workflow for `concerns.ci.provider` — use `concerns.ci.workflow` if the profile sets it, else the provider's conventional file (`.github/workflows/` for GitHub Actions, `.gitlab-ci.yml` for GitLab CI, `.circleci/config.yml` for CircleCI)
- **Inputs:** `project.host`, `project.runtime`, `concerns.ci.provider`,
  `concerns.ci.runs[]`
- **Steps:**
  1. Create the CI workflow for `concerns.ci.provider` (e.g.
     `.github/workflows/ci.yml` for GitHub Actions).
  2. Add a job that installs deps for `project.runtime` and runs each entry in
     `concerns.ci.runs[]` (e.g. `lint`).
- **Verify:** the workflow file is valid YAML and runs the same lint command the
  `lint` concern produced.
