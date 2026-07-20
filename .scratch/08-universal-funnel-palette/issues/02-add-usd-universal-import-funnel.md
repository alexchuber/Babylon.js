# Add the USD to Universal import funnel

Status: ready-for-agent

## What to build

Deliver `Import USD` as `Read USD → USD → Universal` using the aggregate model from issue 01. `Read USD` is a lightweight source boundary that carries resolved source information or bytes; `USD → Universal` owns parsing and conversion. USD remains a distinct source payload kind with no USD-domain operators and no pairwise native transcoders.

Expose a URL property and **Upload USD** action on both the compact aggregate and its Read primitive. The last successful URL or upload wins and persists using the established source behavior.

Keep broad palette assertions, built-in examples, and the default graph out of this slice; issues 12 and 13 own those shared integration surfaces. Prefer focused USD modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

4, 16, 25, 29, 32-34, 36-39.

## Acceptance criteria

- [ ] `Read USD` emits only the distinct USD payload kind and cannot wire to glTF, Babylon, Node Geometry, or Universal consumers except through `USD → Universal`.
- [ ] `USD → Universal` owns USD parsing/conversion and produces Universal content that composes with representative Universal operators and `Export glTF`.
- [ ] `Import USD` is a real aggregate whose build result matches the expanded `Read USD → USD → Universal` graph on a small independent USD fixture.
- [ ] URL and uploaded-file sources are mutually exclusive, the last successful choice wins, and source state round-trips through save/load.
- [ ] The aggregate and Read primitive expose the same URL and **Upload USD** state/action in the properties pane.
- [ ] Editor coverage creates or loads the aggregate, expands it, runs USD through Universal to a valid GLB preview/download, and confirms no USD-domain operator is required.
- [ ] Tests assert valid GLB and meaningful imported asset facts rather than private parser or child-block call order.
- [ ] A fresh-context verifier who did not implement the slice reruns its focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
