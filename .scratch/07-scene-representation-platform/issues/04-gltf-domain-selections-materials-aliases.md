# 04 — glTF domain selections, materials, and aliases

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US6, US8, US12, US16; AG1,
AG5, AG7, AG13) · ADRs: `docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**GltfAsset**, **selector / pointer**,
**selection**, **property accessor**, **BuildPBRMaterial**, **operator block**).

## Goal

Finish the glTF domain migration: glTF blocks use `GLTF_DOCUMENT`, legacy `SCENE` paths remain
compatible, glTF selections become versioned domain selections, material building is decomposed for
new graphs, and Draco/BasisU labels change without breaking serialized class names.

## Why this is its own slice

The glTF domain is the compatibility anchor and sole export terminal. It can land after the schema
migration without waiting for USD/Babylon transcoders.

## KISS ground rules (read first)

- Keep existing operator and MergeScenes behavior; this is a retype and selection hardening slice.
- Keep class-name compatibility for `DracoCompressionBlock` and `KTX2CompressionBlock`.
- Keep the legacy `BuildPBRMaterial` glTF parsing path for milestone 01–06 graphs.
- Do not create a generic selector; glTF Object Model JSON Pointer is the glTF domain's address form.

## What to build

- New `packages/dev/node-assets/src/selection/selection.ts`
  - Define `Selection` as a **correlated (owner-discriminated) union** — owner is the discriminant that
    correlates `targetKind` and `addresses` (glTF pointers vs USD paths vs Babylon refs), not a widened
    struct with optional fields — plus version, cardinality, and validity state.
  - Add glTF helpers for JSON-Pointer-addressed selections.
- `packages/dev/node-assets/src/selector/pointerToAccessor.ts`
  - Keep existing pointer resolution.
  - Add selection-aware entry points that validate owner/version and emit remap/invalidate
    diagnostics.
- `packages/dev/node-assets/src/Blocks/selector.ts`, `getProperty.ts`, `setProperty.ts`,
  `extractTexture.ts`, `setTexture.ts`
  - Accept glTF selections for new graphs while keeping string pointer compatibility.
- `packages/dev/node-assets/src/Blocks/buildPBRMaterial.ts`
  - Split new glTF-targeting material assembly from the legacy glTF parsing path.
  - Prepare for a Babylon-targeting builder in issue 06 without changing legacy serialized graphs.
- `packages/dev/node-assets/src/Blocks/{dedupBlock,pruneBlock,weldBlock,quantizeBlock,simplifyBlock,flattenBlock,centerBlock,normalsBlock,joinBlock,mergeScenes}.ts`
  - Confirm all inputs/outputs are `GLTF_DOCUMENT` and selections are remapped or invalidated where
    structure changes.
- `packages/dev/node-assets/src/Blocks/dracoCompressionBlock.ts` and
  `packages/dev/node-assets/src/Blocks/ktx2CompressionBlock.ts`
  - Palette labels become **Apply Draco** and **Apply BasisU**; class names remain
    `DracoCompressionBlock` / `KTX2CompressionBlock`.
- `packages/dev/node-assets/src/index.ts` and `blockFoundation/blockRegistry.ts` export/register the
  new selection helpers and any decomposed material builder names.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `gltfSelection.test.ts` — glTF selections carry owner/version/targetKind/cardinality/addresses and
  reject stale or wrong-owner use.
- `gltfSelectionRemap.test.ts` — a restructuring mutator remaps one live selection and invalidates
  another with a diagnostic.
- `selector.test.ts`, `getProperty.test.ts`, `setProperty.test.ts`, `extractTexture.test.ts`,
  `setTexture.test.ts` updates — string pointer compatibility and selection-aware paths both work.
- `buildPBRMaterial.test.ts` — new glTF-targeting builder produces the expected material; legacy path
  still passes.
- `dracoCompressionBlock.test.ts` / `ktx2CompressionBlock.test.ts` — labels update while serialized
  class names deserialize.
- `operatorPipeline.test.ts` / `mergeScenes.test.ts` — glTF operators and MergeScenes still work on
  `GLTF_DOCUMENT`.

## Acceptance criteria

- [ ] glTF selections are domain-owned/versioned and wrap the existing JSON Pointer address scheme.
- [ ] Existing pointer strings still work for milestone 01–06 graphs.
- [ ] Mutating glTF blocks remap or invalidate affected selections with diagnostics.
- [ ] glTF operator blocks and MergeScenes are unchanged except for `GLTF_DOCUMENT` typing.
- [ ] BuildPBRMaterial has a new glTF-targeting path and the legacy path remains compatible.
- [ ] Draco/BasisU palette labels are updated while class names remain compatible.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 02 — typed `GLTF_DOCUMENT` representation and `SCENE` alias.

No outward PR/push — commit locally only.
