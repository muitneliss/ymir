## taskfile → Taskfile.yml (single run entrypoint)

- **Why / Findings:** {{TASKFILE_WHY}} — repo scan: {{TASKFILE_FINDINGS}}. Considered: {{TASKFILE_ALTERNATIVES}}.
- **Target:** `Taskfile.yml` at the project root — or the existing `Taskfile.yaml` if the repo already spells it that way (never create a second file alongside one that exists)
- **Inputs:** `project.language`, `project.runtime`, `concerns.taskfile.tasks[]`
  (each `{name, desc, runs}`), `concerns.taskfile.wraps`, plus the command the
  `lint` concern produced
- **Steps:**
  1. **Read `references/taskfile.md`** (relative to the Ymir skill root) before
     writing anything — it is the source of truth for the file shape, the task
     naming set, the `wraps` semantics, and the Task behaviours that differ from
     Make (`deps` run in parallel; each `cmds` entry gets its own shell;
     `task --list` hides tasks without a `desc`). Do not improvise them.
  2. Write `Taskfile.yml` with `version: '3'`, top-level `silent: true`, and one
     task per `concerns.taskfile.tasks[]` entry, each carrying its `desc` and its
     `runs` commands under `cmds`.
  3. Honour `concerns.taskfile.wraps`: `commands` puts the tool invocation
     directly in `cmds`; `scripts` calls the project's existing script
     (`bun run lint`, `make test`). Generate one or the other — never both, and
     never add a duplicate `package.json` script for a task you just wrote.
  4. Add the `default` task running `task --list`, so a bare `task` prints the
     menu. This is how an agent discovers how to run the repo.
  5. Keep the `lint` task's command identical to the one the `lint` concern
     generated (for biome with `strict: true`, that is
     `biome ci --error-on-warnings .`). The Taskfile is the single owner of the
     command text; if they disagree, the Taskfile is wrong, not the linter.
  6. Order-sensitive aggregates (`ci`) use task calls in `cmds`
     (`cmds: [{task: lint}, {task: test}]`), not `deps` — `deps` run in parallel.
  7. Tell the user how to install Task for their platform (the install matrix is
     in `references/taskfile.md`); do not add it as a project dependency.
- **Verify:** `task --list` exits 0 from the project root and lists every entry
  in `concerns.taskfile.tasks[]` with its description; the `lint` task (if any)
  runs the same command the `lint` concern's verify step used.
