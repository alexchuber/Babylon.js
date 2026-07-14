# 02 — Typed representation schema migration

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US6, US16; AG1, AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**connection point type**, **representation**,
**GltfAsset / UsdAsset / BabylonAsset**, **SCENE spine**, **import block**).

## Goal

Introduce the milestone-07 type schema: `GLTF_DOCUMENT`, `USD_STAGE`, `BABYLON_SCENE`,
`NODE_GEOMETRY`, deprecated `SCENE` aliasing, and typed payload wrappers, while keeping existing
milestone 01–06 graphs buildable.

## Why this is its own slice

Every later domain block needs the new connection point kinds and wrappers. This slice is the
schema foundation only: no new transcoders, no build-scope lifecycle, and no editor polish.

## KISS ground rules (read first)

- Keep `NodeAssetConnectionPointType` a flat enum and keep strict kind-equality `connectTo`.
- `SCENE` is source compatibility only: accept it as `GLTF_DOCUMENT`, emit a deprecation
  diagnostic, and do not make new blocks output `SCENE`.
- Prefer additive wrappers around current payloads; do not introduce a generic representation wire,
  common scene supertype, union, `Switch`, hub, or path planner.
- Keep legacy serialized graphs and snippets loading.

## What to build

- `packages/dev/node-assets/src/connection/nodeAssetConnectionPointType.ts`
  - **Explicit enum strategy (no vague normalization):** define **`GLTF_DOCUMENT = 0`** and make
    **`SCENE = GLTF_DOCUMENT`** (a literal alias to the same numeric value `0`, which is what `SCENE`
    already was). **Preserve the existing numeric values of `NUMBER`/`STRING`/`JSON`/`IMAGE`** and
    **append** the new kinds `USD_STAGE`, `BABYLON_SCENE`, `NODE_GEOMETRY` at the end. Because `SCENE`
    and `GLTF_DOCUMENT` are the *same* value, no connection-time normalization is needed — kind-equality
    already treats them as identical; serialized graphs using the old `SCENE` value deserialize unchanged.
- `packages/dev/node-assets/src/connection/nodeAssetConnectionPoint.ts`
  - Keep `value: unknown` and the strict kind-equality `connectTo`. Do **not** add ad-hoc
    `SCENE`↔`GLTF_DOCUMENT` normalization — they are one value.
  - Optionally surface a deprecation diagnostic when a graph/source explicitly names `SCENE`.
- New wrappers:
  - `packages/dev/node-assets/src/representations/gltfAsset.ts`
  - `packages/dev/node-assets/src/representations/usdAsset.ts`
  - `packages/dev/node-assets/src/representations/babylonAsset.ts`
  Each wrapper owns only representation-specific payload shape; lifecycle hooks can be stubbed until
  issue 03.
- Retype glTF boundary and existing glTF blocks from `SCENE` to `GLTF_DOCUMENT`:
  - `Blocks/importGLTFBlock.ts`
  - `Blocks/exportGLTFBlock.ts`
  - `Blocks/{dedupBlock,pruneBlock,weldBlock,quantizeBlock,simplifyBlock,flattenBlock,centerBlock,normalsBlock,joinBlock,mergeScenes}.ts`
  - `Blocks/operatorSupport.ts`
  - `Blocks/getProperty.ts`, `setProperty.ts`, `extractTexture.ts`, `setTexture.ts`
  - `Blocks/buildPBRMaterial.ts` legacy path
- Export wrappers and kinds from `packages/dev/node-assets/src/index.ts` and register any affected
  blocks in `blockFoundation/blockRegistry.ts`.
- **Type precision (no `any`):**
  - Give the serialized NodeAsset graph an **explicit named type** and tighten `NodeAsset.serialize()`
    to return it (do not leave callers typing graph data as `ReturnType<NodeAsset['serialize']>` over an
    `any` return).
  - Model the `JSON` payload kind as a **recursive JSON value type** (primitive | array | object), not
    `any`/`object`.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `typedRepresentations.test.ts` — enum contains the four new kinds, wrappers carry the expected
  payloads, and no generic representation kind exists.
- `sceneAliasCompatibility.test.ts` — `SCENE` and `GLTF_DOCUMENT` are the **same enum value** (`0`);
  old serialized `SCENE` graphs deserialize and build as `GLTF_DOCUMENT` with no normalization step;
  existing `NUMBER`/`STRING`/`JSON`/`IMAGE` numeric values are unchanged.
- `nodeAssetConnectionPoint.test.ts` update — mismatched representation wires reject under strict
  kind-equality; `SCENE`↔`GLTF_DOCUMENT` connect because they are one value (not via special-casing).
- `importExportMetadata.test.ts` / `operatorPipeline.test.ts` updates — ImportGLTF, ExportGLTF,
  operators, MergeScenes, selectors, texture blocks, and legacy BuildPBRMaterial still build.

## Acceptance criteria

- [ ] New connection point kinds exist and remain flat kind-equality types; `GLTF_DOCUMENT = 0`,
      `SCENE = GLTF_DOCUMENT` (same value), `NUMBER`/`STRING`/`JSON`/`IMAGE` numeric values preserved, new
      kinds appended; no connection-time normalization.
- [ ] `SCENE` is a deprecated alias for `GLTF_DOCUMENT`; nothing new emits `SCENE`.
- [ ] `GltfAsset`, `UsdAsset`, and `BabylonAsset` wrappers exist and are exported.
- [ ] The serialized graph has an explicit named type and `serialize()` returns it (no `any`); the `JSON`
      kind uses a recursive JSON value type.
- [ ] Existing glTF blocks operate on `GLTF_DOCUMENT` while legacy `SCENE` graphs still load/build.
- [ ] No generic representation wire, common scene supertype, union, `Switch`, hub, or path planner
      is introduced.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 01 — USD loader port/hardening and `UsdAsset` loader facts.

No outward PR/push — commit locally only.
