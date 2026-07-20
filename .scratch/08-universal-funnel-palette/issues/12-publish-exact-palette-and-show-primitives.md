# Publish the exact palette and Show primitives preference

Status: ready-for-agent

## What to build

Replace the implementation-shaped catalog with the exact PRD palette and a Fluent UI **Show primitives** checkbox in the palette header. It defaults off, persists locally, filters category contents and search, omits empty primitive-only categories, and affects discovery only. It must never hide existing canvas nodes or primitive nodes inside an expanded aggregate.

The default palette is exactly:

- **Inputs / Aggregate imports:** Import glTF; Import USD; Import Babylon; Import Node Geometry.
- **Universal / Cleanup:** Weld Vertices; Deduplicate Resources; Remove Unused Resources; Remove Degenerate Geometry; Fix Face Winding.
- **Universal / Reduction:** Quantize Attributes; Simplify Meshes.
- **Universal / Structure:** Flatten Hierarchy; Join Meshes; Split Meshes by Material; Merge Scenes; Transform Scene; Center Scene.
- **Universal / Attributes:** Recompute Normals; Generate Tangents; Strip Attributes.
- **Universal / Textures:** Resize Textures.
- **glTF / Encoding/output:** Compress Geometry (Draco); Compress Textures (KTX2); Export glTF.

With Show primitives on, additionally expose exactly:

- **Inputs:** Read glTF; Read USD; Read Babylon; Read Node Geometry.
- **Universal:** Universal → glTF; Deduplicate Materials; Deduplicate Textures; Reuse Identical Meshes; Deduplicate Data.
- **glTF:** glTF → Universal; Write glTF.
- **USD:** USD → Universal.
- **Babylon:** Babylon → Universal.
- **Node Geometry:** Node Geometry → Universal.

Remove selectors, accessors, image blocks, values, material blocks, pairwise transcoders, and Evaluate Node Geometry from the product surface. Runtime compatibility registrations may remain only when inexpensive and must not reappear in palette/search metadata.

## User stories covered

21-27, 36-39, 50, 55-56, 61.

## Acceptance criteria

- [ ] With Show primitives off, category order, family grouping, labels, and blocks match the default list exactly; USD, Babylon, and Node Geometry categories are absent.
- [ ] Turning Show primitives on reveals exactly the additional list and no retired implementation-shaped blocks.
- [ ] The checkbox is unchecked by default, uses Fluent conventions and semantic theme tokens, and restores its last local value after reload.
- [ ] Search results use the same filtered catalog as the visible palette and descriptions/keywords retain current workflow-intent search quality.
- [ ] Toggling the preference never removes or changes nodes already on canvas and never hides primitives in an expanded aggregate.
- [ ] Catalog metadata is the single production source for visibility, aggregate relationships, categories, and search; tests do not maintain a second product list.
- [ ] Loading an unsupported retired block fails clearly, while inexpensive compatibility aliases remain load-only and cannot be newly authored.
- [ ] Playwright asserts both exact views, search behavior, preference persistence, empty-category removal, existing-node stability, and expanded-aggregate stability.
- [ ] A fresh-context verifier who did not implement the slice reruns focused unit and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
- 02 — Add the USD to Universal import funnel.
- 03 — Add the Babylon to Universal import funnel.
- 04 — Add the Node Geometry to Universal import funnel.
- 05 — Add Deduplicate Resources and its semantic primitives.
- 06 — Deliver the Universal cleanup operators.
- 07 — Deliver the Universal reduction operators.
- 08 — Deliver the Universal hierarchy and assembly operators.
- 09 — Deliver the Universal scene transform and texture resize operators.
- 10 — Deliver the Universal attribute operators.
- 11 — Align the explicit glTF delivery codecs.
