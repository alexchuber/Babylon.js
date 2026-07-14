# 06 — Babylon domain selections and transcoders

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US4, US5, US8, US10, US12,
US13; AG2, AG4, AG5, AG8, AG9, AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**BabylonAsset**, **transcoder**, **selection**,
**evaluate-once / copy-on-fan-out**, **LossRecord**, **handedness**).

## Goal

Add the Babylon representation domain: `BabylonAsset`, glTF↔Babylon transcoders, Babylon
selections, explicit affine `LossyFork`, and handedness preservation/exposure.

## Why this is its own slice

Babylon brings live `NullEngine` + `Scene` resources and affine fan-out rules. It can land after the
schema/build-scope work and before NodeGeometry bakes into Babylon.

## KISS ground rules (read first)

- Use the existing glTF loader/serializer engines; do not create a new glTF parser/exporter.
- **glTF→Babylon relies on the loader's own render-flag / scene-mode behavior. NAE performs no vertex
  mutation and no custom winding/handedness math.** Tests assert the loader is *invoked* and that the
  resulting scene mode/behavior is correct — not per-vertex geometry math.
- `BabylonAsset` is affine: no implicit clone on fan-out. Duplication must be the explicit
  `LossyFork` block.
- Preserve `scene.useRightHandedSystem`; do not normalize everything to one coordinate mode.
- **Three separate handedness boundaries — never conflate them.** (a) the `BabylonAsset.scene`
  representation contract (RH, no per-vertex mutation; assert `scene.useRightHandedSystem`); (b) the
  loader/root behavior at the loader boundary; (c) the terminal GLB **Viewer preview** boundary
  (separate; owned by the preview slice, not this representation). **Never infer representation handedness
  from preview rendering**, and don't let demo copy claim "native right-handed Babylon" unless the runtime
  path producing an RH `BabylonAsset` is exercised.
- v1 has no Babylon export terminal; Babylon2glTF is the path to the sole glTF terminal.

## What to build

- `packages/dev/node-assets/src/representations/babylonAsset.ts`
  - Own a `NullEngine` + `Scene`, revision, handedness metadata, and build-scope disposal hook.
  - **Model physical convention metadata as four separate fields**: **source value**, **target value**,
    **conversion location/mechanism** (e.g. loader root node vs Viewer preview boundary), and **policy** —
    never conflated into one value.
  - The `BabylonAsset.scene` handedness contract is **distinct from the terminal GLB Viewer preview**
    boundary; do not derive one from the other.
- New transcoders:
  - `packages/dev/node-assets/src/Blocks/gltf2babylon.ts` (`GLTF_DOCUMENT` → `BABYLON_SCENE`)
  - `packages/dev/node-assets/src/Blocks/babylon2gltf.ts` (`BABYLON_SCENE` → `GLTF_DOCUMENT`)
  - `packages/dev/node-assets/src/Blocks/lossyFork.ts` (`BABYLON_SCENE` → `BABYLON_SCENE`)
- `gltf2babylon.ts`
  - Use `packages/dev/loaders/src/glTF/2.0/glTFLoader.pure.ts` (`GLTFLoader`) in a `NullEngine`
    scene and register the scene with build scope.
- `babylon2gltf.ts`
  - Use `packages/dev/serializers/src/glTF/2.0/glTFExporter.ts` (`GLTFExporter`) and report loss
    for Babylon constructs that cannot be represented in glTF.
- `lossyFork.ts`
  - Make Babylon duplication explicit and emit a `LossRecord` describing what cannot be faithfully
    copied.
- `packages/dev/node-assets/src/selection/selection.ts`
  - Add Babylon owner, scene-object addresses, version checking, and remap/invalidate diagnostics.
  - Babylon selections are **first-class capturable wire values** that **route/fan-out within the Babylon
    domain** and are **rejected cross-domain**; only the TypeScript encoding is implementation-owned
    (ADR 0006).
- `packages/dev/node-assets/src/Blocks/buildPBRMaterial.ts`
  - Add the Babylon-targeting material builder path if issue 04 prepared the split.
- `packages/dev/node-assets/src/index.ts` and `blockFoundation/blockRegistry.ts`
  - Export/register new blocks and `BabylonAsset`.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `gltf2babylon.test.ts` — ImportGLTF → glTF2Babylon produces a `BabylonAsset` and a live scene, and
  **asserts the in-repo `GLTFLoader` is invoked and the resulting scene mode is right-handed where the
  loader sets it** — behavior/invocation only, no per-vertex winding assertions (NAE mutates no
  geometry).
- `babylon2gltf.test.ts` — BabylonAsset → Babylon2glTF → ExportGLTF emits a valid glb and expected
  `LossRecord`s for unsupported Babylon constructs.
- `babylonRoundTrip.test.ts` — ImportGLTF → glTF2Babylon → Babylon-native edit →
  Babylon2glTF preserves the edited property and handedness.
- `babylonSelection.test.ts` — Babylon selections are owner/version checked, capturable wire values that
  route within the Babylon domain and are **rejected cross-domain**, and are remapped or invalidated on
  scene mutations.
- `lossyFork.test.ts` — implicit fan-out of `BabylonAsset` fails; explicit LossyFork permits two
  independent Babylon edit branches and reports loss.
- `buildScopeLifecycle.test.ts` update — `NullEngine`/`Scene` dispose exactly once on success and
  abort. Model the leak/disposal coverage on Babylon's own `@tools/memory-leak-tests` harness (not NAE's
  lightweight plain-object style): dispose-on-teardown, idempotent second-dispose, and no leaked
  engine/scene on an unconsumed or rejected fork.
- `physicalMetadataFields.test.ts` — the `BabylonAsset` physical-convention metadata exposes **four
  distinct, independently-readable fields** (source convention, target convention, conversion
  location/mechanism, policy). Assert they are **not conflated**: setting/reading each is independent (a
  change to one does not alter another), and the `BabylonAsset.scene` representation handedness value is
  distinct from the terminal Viewer render-scene mode.

## Acceptance criteria

- [ ] `BabylonAsset` owns `NullEngine` + `Scene` and is disposed by build scope.
- [ ] `glTF2Babylon` and `Babylon2glTF` are explicit named transcoders using in-repo
      loader/serializer engines.
- [ ] `LossyFork` is the only way to duplicate a Babylon representation.
- [ ] Babylon selections are domain-owned/versioned, first-class capturable wire values that route within
      the Babylon domain and are rejected cross-domain; stale selections do not silently resolve.
- [ ] Handedness is preserved and exposed through `scene.useRightHandedSystem`.
- [ ] Physical metadata carries **four separate fields** — source convention, target convention,
      conversion location/mechanism, and policy — and **`physicalMetadataFields.test.ts` proves they are
      not conflated** (each field is independently set/read; changing one does not alter another). The
      `BabylonAsset.scene` representation handedness is distinct from the terminal Viewer render-scene
      boundary.
- [ ] No Babylon export terminal, generic conversion wire, or path planner is introduced.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 02 — typed `BABYLON_SCENE` and `BabylonAsset` wrapper.
- Issue 03 — build scope lifecycle, disposal, diagnostics, and affine fan-out.
- Issue 01 — USD loader engine context for matching USD2Babylon handedness behavior.

No outward PR/push — commit locally only.
