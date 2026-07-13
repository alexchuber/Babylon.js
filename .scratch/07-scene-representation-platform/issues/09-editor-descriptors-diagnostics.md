# 09 — Editor descriptors, Transcoders palette, and diagnostics

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US6, US12, US13, US15; AG8,
AG9, AG11, AG13) · ADRs: `docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**representation**, **transcoder**, **LossRecord**,
**handedness**, **Evaluate / Bake**) and `packages/tools/nodeAssetsEditor/CONTEXT.md`
(**port**, **palette**, **Transcoders**, **diagnostics surfacing**, **preview**).

## Goal

Expose the milestone-07 runtime in Node Assets Editor: distinct representation port colors,
descriptors for new blocks, a Transcoders palette category, handedness metadata, and diagnostics /
LossRecord surfacing on nodes and in a list.

## Why this is its own slice

The editor should bind to landed runtime blocks instead of driving their design. This slice is UI
metadata and surfacing, not runtime transcoder behavior.

## KISS ground rules (read first)

- The framework stays domain-agnostic; NodeAssets-specific descriptors live in the app layer.
- Each representation gets its own port color; no generic representation port.
- Diagnostics are surfaced from build results; do not parse console output.
- Add the Transcoders category only for the four named v1 transcoders.

## What to build

- `packages/tools/nodeAssetsEditor/src/nodeAssets/paletteCategories.ts`
  - Add **Transcoders** category.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/blockCatalog.ts`
  - Add descriptors for new import blocks, USD2glTF, USD2Babylon, glTF2Babylon, Babylon2glTF,
    LossyFork, ImportNodeGeometry, EvaluateNodeGeometry, BakeNodeGeometry, and decomposed material
    builders.
  - Relabel Draco/BasisU as **Apply Draco** / **Apply BasisU** while preserving backend class names.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/blockNodeMapping.ts`
  - Map runtime connection point kinds to distinct port colors for `GLTF_DOCUMENT`, `USD_STAGE`,
    `BABYLON_SCENE`, and `NODE_GEOMETRY`.
  - Surface handedness metadata for Babylon preview/manifest.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetGraphController.ts`
  - Consume build-scope diagnostics and associate them with offending nodes.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetBuildWorkerCore.ts`
  - Return diagnostics/LossRecords through the editor build result.
- Framework surfacing:
  - `packages/tools/nodeAssetsEditor/src/nodeGraph/paletteModel.ts`
  - `packages/tools/nodeAssetsEditor/src/nodeGraph/editorContext.ts`
  - `packages/tools/nodeAssetsEditor/src/nodeGraph/components/PaletteView.tsx`
  Add the minimal domain-agnostic data needed for port color and diagnostics display.

## Tests

Tests first under `packages/tools/nodeAssetsEditor/`:

- `src/nodeAssets/blockCatalog.test.ts` — all new runtime blocks have descriptors; exactly four
  transcoders appear under Transcoders.
- `src/nodeAssets/blockNodeMapping.test.ts` — representation/resource kinds map to distinct colors
  and no generic representation port exists.
- `src/nodeAssets/nodeAssetGraphController.test.ts` — build diagnostics/LossRecords attach to the
  offending node and diagnostics list data.
- `src/nodeAssets/nodeAssetBuildWorkerCore.test.ts` — worker result includes diagnostics and
  handedness metadata.
- `src/nodeGraph/components/PaletteView.test.tsx` — Transcoders category renders and filters.
- Runtime smoke under `packages/dev/node-assets/test/unit/editorDescriptorSmoke.test.ts` if a
  runtime-descriptor contract exists.

## Acceptance criteria

- [ ] Editor descriptors exist for all landed milestone-07 runtime blocks.
- [ ] The palette has a Transcoders category containing only USD2glTF, USD2Babylon,
      glTF2Babylon, and Babylon2glTF.
- [ ] `GLTF_DOCUMENT`, `USD_STAGE`, `BABYLON_SCENE`, and `NODE_GEOMETRY` render with distinct
      port colors.
- [ ] Diagnostics and `LossRecord`s render on offending nodes and in a diagnostics list.
- [ ] Handedness is exposed in the editor/manifest for Babylon previews.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 04 — glTF domain blocks/selections/material descriptors.
- Issue 05 — USD import/transcoder blocks.
- Issue 06 — Babylon transcoders, LossyFork, handedness metadata.
- Issue 07 — NodeGeometry import/Evaluate/Bake blocks.

No outward PR/push — commit locally only.
