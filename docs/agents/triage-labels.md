# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual state strings used in this repo's issue tracker.

For the local-markdown tracker, the "label" is the value on the `Status:` line at the top of each issue file (see `issue-tracker.md`).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Done state: `resolved`

The five roles above are all **pre-work** states — none of them means "finished." For a completed
implementation issue, set `Status: resolved`. This reuses the word the tracker's wayfinding flow already
uses for a closed child ticket (see `issue-tracker.md`), so the tracker has one consistent done-state.

- Use `resolved` when an issue's acceptance criteria are demonstrably met and the change has landed.
- `resolved` (not `landed`, `done`, `shipped`, or `closed`) is the canonical string — normalize any
  ad-hoc done-words to it.
- `wontfix` remains the terminal state for work that will not be actioned.
