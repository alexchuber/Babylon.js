# Agent Instructions

This repo is configured for the engineering skills under `.agents/skills/`. Repo-specific
conventions those skills rely on are recorded below and in `docs/agents/`.

For general Copilot guidance, see also `.github/copilot-instructions.md`.

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under `.scratch/<feature-slug>/`; triage state is a `Status:` line in each file. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage states using the default strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the repo root points to per-package `CONTEXT.md` files. See `docs/agents/domain.md`.
