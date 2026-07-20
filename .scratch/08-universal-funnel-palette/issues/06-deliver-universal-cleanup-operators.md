# Deliver the Universal cleanup operators

Status: ready-for-agent

## What to build

Deliver the independently composable Universal cleanup decisions **Weld Vertices**, **Remove Unused Resources**, **Remove Degenerate Geometry**, and **Fix Face Winding**. Reuse and rename existing functionality where appropriate, but preserve these exact public names and keep every operator Universal-to-Universal.

Properties are: Weld Vertices — **Overwrite existing**; Remove Unused Resources — kept property types, leaf nodes, attributes, solid textures, and extras; Remove Degenerate Geometry — **Tolerance**; Fix Face Winding — no required property.

Keep broad palette assertions, built-in examples, the default graph, and shared all-operator snapshots out of this slice; issues 12 and 13 own those integration surfaces. Prefer focused cleanup modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

40, 44-45, 63.

## Acceptance criteria

- [ ] The four exact operators are independently placeable Universal-to-Universal blocks with the approved property scopes.
- [ ] Each operator has a focused runtime fixture proving its externally meaningful effect without reproducing the implementation algorithm in assertions.
- [ ] A representative chain containing all four still builds a valid GLB and preserves usable geometry.
- [ ] Editor descriptors expose the exact approved names, Universal category/family metadata, descriptions, and configurable properties.
- [ ] Existing saved graphs receive intentional aliases/compatibility where practical; unsupported retired spellings fail clearly rather than silently changing semantics.
- [ ] Playwright adds each operator to a working aggregate import/export graph, edits its properties, and confirms preview/build success.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
