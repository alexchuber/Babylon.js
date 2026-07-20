# Add Deduplicate Resources and its semantic primitives

Status: ready-for-agent

## What to build

Deliver the Universal `Deduplicate Resources` aggregate as the ordered composition **Deduplicate Materials → Deduplicate Textures → Reuse Identical Meshes → Deduplicate Data**. Each primitive is an independently reusable Universal-to-Universal decision with **Keep unique names** configuration. `Deduplicate Data` owns accessor/skin deduplication; `Reuse Identical Meshes` describes shared mesh resources and must not be presented as runtime GPU instancing.

The aggregate is visible by default; its four primitives are hidden-primitives metadata consumers that the later palette issue will filter.

Keep broad palette assertions, built-in examples, and the default graph out of this slice; issues 12 and 13 own those shared integration surfaces. Prefer focused deduplication modules/descriptors/tests and only minimal shared registration edits.

## User stories covered

41-43, 62.

## Acceptance criteria

- [ ] All four exact primitive names operate on Universal and expose **Keep unique names** without leaking implementation enum names into the product surface.
- [ ] Focused fixtures independently prove meaningful material, texture, identical-mesh resource, and accessor/skin deduplication effects.
- [ ] `Deduplicate Resources` is a real typed aggregate in the documented order and produces the same observable result as the expanded primitive composition.
- [ ] The aggregate supports the shared expand/collapse, save/load, detachment, and forwarded-property behavior without special parallel aggregate logic.
- [ ] Aggregate property sections remain attributable when the four children expose similarly named controls.
- [ ] Editor coverage verifies compact use in a working Universal-to-GLB graph and expanded independent reordering/configuration.
- [ ] Catalog metadata marks only the four primitives as abstracted by `Deduplicate Resources`; the aggregate itself remains a default user decision.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
