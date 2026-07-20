# Align the explicit glTF delivery codecs

Status: ready-for-agent

## What to build

Keep **Compress Geometry (Draco)** and **Compress Textures (KTX2)** as explicit glTF-to-glTF delivery operators after `Universal → glTF`, and align their complete researched property surfaces and editor names. They remain visible user decisions, not hidden aggregate primitives.

Compress Geometry exposes method, encode/decode speed, position/normal/color/texture-coordinate/generic quantization bits, quantization volume, custom bounds, and compatibility information. Compress Textures retains mipmaps, texture and slot filters, output container, ETC1S/UASTC settings, perceptual metrics, transfer function, RDO, Zstandard, normal-map tuning, Flip Y, HDR, metadata, and encoder locations.

Keep broad palette assertions, built-in examples, and the default graph out of this slice; issues 12 and 13 own those shared integration surfaces. Prefer focused codec descriptors/tests and only minimal shared registration edits.

## User stories covered

51-54, 58, 63.

## Acceptance criteria

- [ ] Both exact codec names accept and emit glTF only; Universal cannot connect directly to either codec.
- [ ] All approved properties are represented, validated, serialized, restored, and editable without palette variants.
- [ ] Compatibility information is visible and actionable rather than silently accepting unsupported combinations.
- [ ] Runtime tests prove Draco and KTX2 extensions/output facts on independent small fixtures and cover the advanced path `Universal → glTF → Compress Textures (KTX2) → Compress Geometry (Draco) → Write glTF`.
- [ ] Editor coverage proves the advanced explicit lane previews and downloads a non-empty valid GLB with the requested filename.
- [ ] Existing codec behavior and preview restoration fixes remain intact while obsolete names such as Apply Draco/Apply BasisU are not active alongside the approved vocabulary.
- [ ] A fresh-context verifier who did not implement the slice reruns focused runtime and Playwright checks and records evidence before resolution.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
