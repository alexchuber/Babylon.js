# Add the Babylon to Universal import funnel

Status: ready-for-agent

## What to build

Deliver `Import Babylon` as `Read Babylon → Babylon → Universal`. `Read Babylon` must carry a shallow Babylon source payload from a URL or uploaded `.babylon` file, while `Babylon → Universal` owns loading/conversion. Babylon remains a distinct source payload kind with no Babylon-domain operators and no pairwise transcoders.

Expose a URL property and **Upload Babylon** action on both aggregate and Read primitive, backed by the same last-successful source state.

Keep broad palette assertions, built-in examples, and the default graph out of this slice; issues 12 and 13 own those shared integration surfaces. Prefer focused Babylon modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

5, 16, 25, 30, 32-34, 36-39.

## Acceptance criteria

- [ ] `Read Babylon` has no source connection point, emits the distinct Babylon payload kind, and cannot wire outside its matching transcoder.
- [ ] `Babylon → Universal` owns parse/load/conversion and produces Universal content that can be optimized and exported as GLB.
- [ ] `Import Babylon` builds the same externally meaningful result as `Read Babylon → Babylon → Universal` on a small independent `.babylon` fixture.
- [ ] URL and upload are mutually exclusive, the last successful choice wins, and source state persists through save/load.
- [ ] Compact and expanded property panes operate on the same URL and **Upload Babylon** action/state.
- [ ] Playwright proves a Babylon source can traverse Universal optimization to a valid preview and non-empty GLB download.
- [ ] No Babylon-domain operator, pairwise transcoder, or implicit glTF/Universal compatibility is introduced.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
