# Add the Node Geometry to Universal import funnel

Status: resolved

## What to build

Deliver `Import Node Geometry` as `Read Node Geometry → Node Geometry → Universal`. `Read Node Geometry` resolves a snippet ID or uploaded serialized graph into a shallow Node Geometry payload. `Node Geometry → Universal` owns parsing, evaluation, and conversion directly to Universal; there is no standalone Evaluate node and no visible intermediate Babylon conversion.

Expose **Snippet ID** and **Upload Node Geometry** on both aggregate and Read primitive, sharing one last-successful source state.

Keep broad palette assertions, built-in examples, and the default graph out of this slice; issues 12 and 13 own those shared integration surfaces. Prefer focused Node Geometry modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

6, 16, 25, 31-39.

## Acceptance criteria

- [x] `Read Node Geometry` has no source connection point, accepts snippet ID or upload, and emits only the distinct Node Geometry payload kind.
- [x] `Node Geometry → Universal` parses/evaluates the graph and produces Universal content without an `Evaluate Node Geometry` block or visible Babylon payload.
- [x] `Import Node Geometry` matches its expanded primitive graph on a small independent Node Geometry fixture and produces a valid GLB after Universal optimization/export.
- [x] Snippet and upload are mutually exclusive, the last successful choice wins, and source state persists through save/load.
- [x] Compact and expanded properties share the exact **Snippet ID** and **Upload Node Geometry** state/action.
- [x] Runtime tests prove unrelated-domain wiring is rejected and evaluation yields externally meaningful geometry facts.
- [x] Playwright proves the full aggregate path, expansion, preview, and GLB download.
- [x] The obsolete Evaluate primitive is absent from the product surface; compatibility registration may remain only if inexpensive and not exposed.
- [x] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Verification evidence

- Fresh-context focused unit verification passed 132 of 133 tests; the only failure was an unrelated pre-existing KTX2 test timeout under shared-machine load.
- Fresh-context Playwright verification passed the aggregate snippet/upload, expansion, persistence, preview, and GLB download workflow.
- The downloaded GLB contained one box primitive with 24 positions and 36 indices.
- Formatting, changed-source ESLint, development-package typecheck, all 16 tree-shaking checks, side-effect manifest sync, and `git diff --check` passed.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
