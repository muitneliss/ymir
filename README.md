# Ymir

A Claude Code plugin marketplace + plugin that scaffolds the **mandatory project
harness** every repo should start with — rules, lint, CI lint, wiki/context, and
`CLAUDE.md`/`AGENT.md`.

Ymir does **not** generate application code. It interviews you about your
techstack (Go vs TypeScript, frontend vs backend, …) and builds only the
skeleton. You then drive the actual development through Claude Code, guided by the
harness Ymir laid down.

## Layout

```
ymir/
├── .claude-plugin/
│   └── marketplace.json        # the "ymir" marketplace
└── plugins/
    └── ymir/                   # the "ymir" plugin
        ├── .claude-plugin/
        │   └── plugin.json
        └── skills/
            └── init/
                └── SKILL.md    # entry-point skill → /ymir:init
```

## Try it locally

```shell
/plugin marketplace add ./ymir
/plugin install ymir@ymir
/ymir:init
```

## Status

Early scaffold (`v0.1.0`). The socratic interview is stubbed; per-stack harness
templates are not implemented yet.
