---
title: Playbook CI
type: source
date: 2026-08-18
tags: []
source: plugins/ymir/templates/playbook/ci.md
source_path: plugins/ymir/templates/playbook/ci.md
source_hash: 79fb53fbf704e5c542612c40c532612a9d719c3a4eecc0eed80adb5a03a62910
ingested: 2026-08-18
---

# Playbook CI

Playbook section template for the CI lint concern, assembled into harness-playbook.md when ymir apply generates the harness. Opens with a Why/Findings placeholder block, states the Target (the CI workflow file for concerns.ci.provider, e.g. .github/workflows/ci.yml for GitHub Actions), lists Inputs (project.host, project.runtime, concerns.ci.provider, concerns.ci.runs[]), Steps (create the workflow, add a job installing deps and running each entry in runs[]), and a Verify criterion that the workflow is valid YAML and runs the same lint command the lint concern produced.
