# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**: a `CONTEXT-MAP.md` at the root points at one `CONTEXT.md` per package.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. Also check each package's `docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md                     ← points to each package's CONTEXT.md
├── docs/adr/                          ← system-wide decisions
└── packages/
    └── dev/
        ├── core/
        │   ├── CONTEXT.md
        │   └── docs/adr/              ← package-specific decisions
        └── gui/
            ├── CONTEXT.md
            └── docs/adr/
```

Packages live under `packages/` (e.g. `packages/dev/core`, `packages/dev/gui`, `packages/dev/loaders`, `packages/dev/serializers`, `packages/dev/inspector-v2`, and the tools under `packages/tools/`). Add a per-package `CONTEXT.md` only for packages whose domain language is worth pinning down; `CONTEXT-MAP.md` records which packages have one.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
