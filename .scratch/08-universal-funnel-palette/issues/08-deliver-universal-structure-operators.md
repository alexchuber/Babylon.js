# Deliver the Universal hierarchy and assembly operators

Status: resolved

## What to build

Deliver **Flatten Hierarchy**, **Join Meshes**, **Split Meshes by Material**, and **Merge Scenes** as independent Universal-to-Universal structure decisions.

Flatten Hierarchy exposes cleanup empty nodes. Join Meshes exposes keep separate meshes, keep named nodes, and cleanup. Split Meshes by Material has no required property. Merge Scenes supports variadic Universal inputs and an **Add input** action.

Keep broad palette assertions, built-in examples, the default graph, and shared all-operator snapshots out of this slice; issues 12 and 13 own those integration surfaces. Prefer focused structure modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

47, 59, 63.

## Acceptance criteria

- [ ] The four exact structure names operate only on Universal and expose precisely the approved controls.
- [ ] Merge Scenes can add inputs repeatedly, persists its input arity, and accepts multiple Universal sources without union types or implicit conversion.
- [ ] Focused runtime fixtures prove hierarchy flattening, mesh joining, material-based splitting, and multi-source scene merge through externally observable asset facts.
- [ ] A representative structure chain produces a valid GLB and remains safe under fan-out/copy behavior.
- [ ] Editor nodes add/connect cleanly, **Add input** updates ports without corrupting existing wires, and save/load restores the graph.
- [ ] Playwright demonstrates two differently sourced Universal values converging through Merge Scenes and successfully previewing/exporting.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.

## Verification

A fresh-context verifier confirmed the focused acceptance seams:

- `universalStructureOperators.test.ts`: 5 passed, 0 failed.
- Node Assets Editor Merge Scenes Playwright proof: 1 passed, 0 failed.
