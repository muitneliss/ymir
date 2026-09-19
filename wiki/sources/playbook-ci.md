---
title: Playbook CI
type: source
date: 2026-09-19
tags: []
source: plugins/ymir/templates/playbook/ci.md
source_path: plugins/ymir/templates/playbook/ci.md
source_hash: da54ca06ce2f287de0df1d19ff10c3a958d8ebd5612f33c35ef3790a0f43dad5
ingested: 2026-09-19
---

# Playbook CI

Playbook section template for the CI lint concern, assembled into harness-playbook.md when ymir apply generates the harness. Opens with a Why/Findings placeholder block, states the Target (the CI workflow file for concerns.ci.provider, e.g. .github/workflows/ci.yml for GitHub Actions), lists Inputs (project.host, project.runtime, concerns.ci.provider, concerns.ci.runs[], concerns.taskfile.status and tasks[]), Steps (create the workflow, add a job installing deps and running each entry in runs[]), and a Verify criterion that the workflow is valid YAML and runs the same lint command the lint concern produced.

A third step branches on the taskfile concern: when it is captured, CI installs Task (`go-task/setup-task@v1` on GitHub Actions, the install script elsewhere) and runs each entry as `task <name>` instead of repeating its command, so the workflow never holds a second copy of a command the Taskfile already owns. See [[Playbook Taskfile]] and [[Taskfile Guideline]].
