# Deliver the Universal reduction operators

Status: ready-for-agent

## What to build

Deliver **Quantize Attributes** and **Simplify Meshes** as configurable Universal-to-Universal reduction blocks. Keep algorithm tuning in properties rather than creating palette variants.

Quantize Attributes exposes position, normal, texture-coordinate, color, weight, and generic bits; normalize weights; attribute and morph-target patterns; quantization volume; and cleanup. Simplify Meshes exposes target ratio, error limit, and lock border.

Keep broad palette assertions, built-in examples, the default graph, and shared all-operator snapshots out of this slice; issues 12 and 13 own those integration surfaces. Prefer focused reduction modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

46, 63.

## Acceptance criteria

- [ ] The exact **Quantize Attributes** and **Simplify Meshes** names and Universal wire kinds appear in runtime and editor surfaces.
- [ ] Every approved option is configurable, validated, serialized, restored, and forwarded through normal editor descriptor/property seams.
- [ ] Focused runtime fixtures prove quantization metadata/precision and mesh reduction facts while preserving valid output.
- [ ] The two operators compose in either valid order with other Universal operators and end in a valid GLB.
- [ ] Playwright edits representative options and confirms preview/build after each block is inserted into a simple aggregate graph.
- [ ] Existing operator-pipeline and serialization coverage is migrated without preserving obsolete public names beside the new names.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
