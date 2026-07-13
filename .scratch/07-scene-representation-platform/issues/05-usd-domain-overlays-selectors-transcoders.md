# 05 — USD domain overlays, selectors, and transcoders

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US1, US2, US3, US7, US8, US12,
US13; AG2, AG4, AG5, AG8, AG9, AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**UsdAsset**, **import block**, **transcoder**,
**selection**, **LossRecord**, **handedness**).

## Goal

Add the USD NodeAssets domain: new USD import to `USD_STAGE`, immutable overlays and USD
selections, plus explicit `USD2glTF` and `USD2Babylon` transcoders with documented loss records.

## Why this is its own slice

USD authoring behavior is separable once the loader, schema, and build scope exist. It should not
be mixed with Babylon-domain selection work or editor descriptors.

## KISS ground rules (read first)

- New graphs use the dependency-free loader to produce `UsdAsset`; keep legacy tinyusdz
  `ImportUSDBlock` hidden/deprecated and compatible.
- USD edits are immutable overlays on a frozen `IResolvedStage`; never mutate the resolved stage.
- Ship only the two USD transcoders named by the PRD; no generic converter or path planner.
- Surface non-fatal loss as `LossRecord`; throw only fatal parse/grammar/version errors.

## What to build

- `packages/dev/node-assets/src/representations/usdAsset.ts`
  - Wrap frozen `IResolvedStage` plus immutable NodeAssets overlay state and revision.
  - Provide overlay-copy behavior for fan-out.
- New USD import block, e.g. `packages/dev/node-assets/src/Blocks/importUSD2.ts`
  - Bytes → `USD_STAGE` using `ResolveUsdStageAsync` / injectable fetcher where possible.
  - Register output with build scope.
  - Keep `Blocks/importUSDBlock.ts`, `tinyUsdzTranscoder.ts`, and `tinyusdz.d.ts` as legacy
    compatibility-only.
- New selection/overlay support in `packages/dev/node-assets/src/selection/selection.ts`
  - USD owner, prim/property path addresses, version checking, remap/invalidate diagnostics.
  - Overlay records for material retarget and transform override.
- New transcoders:
  - `packages/dev/node-assets/src/Blocks/usd2gltf.ts` (`USD_STAGE` → `GLTF_DOCUMENT`)
  - `packages/dev/node-assets/src/Blocks/usd2babylon.ts` (`USD_STAGE` → `BABYLON_SCENE`)
- `usd2babylon.ts`
  - Use `AdaptResolvedStageToScene` from `packages/dev/loaders/src/USD/adapter/usdAdapter.ts`.
  - Preserve right-handed mode and no per-vertex/index flips.
- `usd2gltf.ts`
  - **Genuinely direct**: map the frozen `IResolvedStage` straight to a glTF `Document` via a dedicated
    `AdaptResolvedStageToScene`-sibling mapper (e.g. `AdaptResolvedStageToDocument` / `gltfStageMapper.ts`)
    that consumes the **same** `IResolvedStage`. Do **not** route through `BABYLON_SCENE`. Emit
    `LossRecord`s (disposition `preserve | bake | drop | extension`) for dropped USD semantics.
- Register/export new blocks in `packages/dev/node-assets/src/index.ts` and
  `blockFoundation/blockRegistry.ts`.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `importUSD2.test.ts` — valid `.usda`/`.usdz` fixture imports to `UsdAsset`, frozen stage is
  mutation-safe, legacy tinyusdz block remains loadable but hidden/deprecated.
- `usdSelectionOverlay.test.ts` — overlay edits **never mutate the frozen base**; overlay edits are
  **visible when resolving through the asset but invisible on the base directly**; prim/property selections
  invalidate stale selections with diagnostics.
- `usdOverlayFanOut.test.ts` — overlay state **survives fan-out/clone without leaking across branches**
  (one branch's overlay edit is not visible on a sibling branch).
- `usd2gltf.test.ts` — USD fixture transcodes to a valid `GltfAsset`/glb through ExportGLTF and
  emits expected `LossRecord`s for dropped USD semantics; a **spy test asserts the Babylon adapter
  (`AdaptResolvedStageToScene`) is never called** — the path is genuinely direct, not routed through
  Babylon.
- `usd2babylon.test.ts` — USD fixture transcodes to `BabylonAsset`; scene is right-handed with
  root-only up-axis/unit correction.
- `usdFanOut.test.ts` — fan-out shares the frozen stage and copies overlays without branch
  contamination.
- `lossRecordDiagnostics.test.ts` update — fatal loader errors fail; non-fatal USD loss records
  succeed with diagnostics.

## Acceptance criteria

- [ ] New USD import block outputs `USD_STAGE`/`UsdAsset` using the dependency-free loader.
- [ ] Legacy tinyusdz `ImportUSDBlock` is retained, hidden/deprecated, and compatibility-only.
- [ ] USD selections are domain-owned/versioned prim/property paths and edits are immutable
      overlays.
- [ ] `USD2glTF` and `USD2Babylon` are explicit named transcoders and no additional USD
      transcoders are added.
- [ ] USD transcoders emit documented `LossRecord`s; fatal loader errors still fail the build.
- [ ] USD2Babylon preserves right-handed scenes without per-vertex/index flips.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 01 — USD loader port/hardening.
- Issue 02 — typed `USD_STAGE` and payload wrappers.
- Issue 03 — build scope lifecycle, diagnostics, and fan-out policy.

No outward PR/push — commit locally only.
