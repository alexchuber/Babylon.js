# Deliver the Universal attribute operators

Status: ready-for-agent

## What to build

Deliver **Recompute Normals**, **Generate Tangents**, and **Strip Attributes** as independent Universal-to-Universal attribute decisions. Recompute Normals exposes **Overwrite existing**; Generate Tangents has no required property; Strip Attributes selects explicit attribute kinds.

Keep face winding repair separate from normal generation and keep all three operations source-format independent.

Keep broad palette assertions, built-in examples, the default graph, and shared all-operator snapshots out of this slice; issues 12 and 13 own those integration surfaces. Prefer focused attribute modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

45, 48, 63.

## Acceptance criteria

- [ ] The three exact operators use Universal inputs/outputs and expose only the approved controls.
- [ ] Focused fixtures prove normal replacement/preservation, tangent generation, and selected-attribute removal through observable accessor/primitive facts.
- [ ] Fixing face winding is not implicitly performed by Recompute Normals and no hidden format conversion occurs.
- [ ] A representative attribute chain builds a valid GLB from a source aggregate and remains usable by downstream glTF codecs.
- [ ] Editor properties serialize/restore and the exact names/descriptions appear in the Universal Attributes family metadata.
- [ ] Playwright inserts each operator, edits representative settings, and confirms preview/export.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
