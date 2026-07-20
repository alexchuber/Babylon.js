# Deliver the Universal scene transform and texture resize operators

Status: ready-for-agent

## What to build

Deliver **Transform Scene**, **Center Scene**, and **Resize Textures** as independent Universal-to-Universal decisions.

Transform Scene exposes units, scale, rotation, and up axis. Center Scene exposes center/above/below/custom-point pivot and the custom point. Resize Textures operates on textures inside Universal and exposes maximum dimensions and resize mode; it must not recreate a detached Image domain.

Keep broad palette assertions, built-in examples, the default graph, and shared all-operator snapshots out of this slice; issues 12 and 13 own those integration surfaces. Prefer focused scene/texture modules, descriptors, and tests with only minimal shared registration edits.

## User stories covered

47, 49-50, 63.

## Acceptance criteria

- [ ] The three exact operators use Universal inputs/outputs and expose all approved options with validated serialization.
- [ ] Runtime fixtures prove unit/up-axis/transform changes, pivot placement modes, and in-document texture dimension reduction through public asset facts.
- [ ] Resize Textures does not expose image ports, image import/export, channel packing, or generic re-encoding.
- [ ] The operators compose with source aggregates, other Universal operations, and aggregate export to a valid GLB.
- [ ] Editor descriptors and property panes use exact approved names and controls without raw ad hoc styling.
- [ ] Playwright edits representative transform, custom pivot, and resize settings and confirms a successful preview/export.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
