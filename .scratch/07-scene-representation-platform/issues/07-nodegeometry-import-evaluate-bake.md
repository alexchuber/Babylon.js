# 07 — NodeGeometry import, Evaluate, and Bake

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US9; AG6, AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**NODE_GEOMETRY**, **Evaluate / Bake**,
**BabylonAsset**, **selection**, **resource lane**) and
`packages/tools/nodeAssetsEditor/CONTEXT.md` (**resource lane**).

## Goal

Add the NodeGeometry resource lane: import unevaluated NodeGeometry, explicit `Evaluate`, and
`Bake` into a Babylon representation.

## Why this is its own slice

NodeGeometry is a procedural resource, not a fourth 3D representation. It depends on the schema,
build scope, and BabylonAsset but should stay separate from USD/glTF/Babylon transcoders.

## KISS ground rules (read first)

- Import does not build geometry.
- `Evaluate` is the only block that runs the procedural graph.
- `Bake` is the only block that turns the evaluated result into `BABYLON_SCENE`.
- Selections over NodeGeometry resolve only after `Evaluate`; do not treat resource lanes as a type
  or selection owner.

## What to build

- New blocks:
  - `packages/dev/node-assets/src/Blocks/importNodeGeometry.ts`
  - `packages/dev/node-assets/src/Blocks/evaluateNodeGeometry.ts`
  - `packages/dev/node-assets/src/Blocks/bakeNodeGeometry.ts`
- `importNodeGeometry.ts`
  - Bytes/JSON/source payload → `NODE_GEOMETRY` resource without evaluating.
- `evaluateNodeGeometry.ts`
  - `NODE_GEOMETRY` → evaluated resource payload, registered with build scope.
  - Resolve NodeGeometry selections only after evaluation.
- `bakeNodeGeometry.ts`
  - Evaluated NodeGeometry → `BABYLON_SCENE` / `BabylonAsset`.
  - Reuse the Babylon domain lifecycle and handedness behavior from issue 06.
- `packages/dev/node-assets/src/connection/nodeAssetConnectionPointType.ts`
  - Use the `NODE_GEOMETRY` kind added in issue 02; do not add a new representation kind.
- `packages/dev/node-assets/src/selection/selection.ts`
  - Add NodeGeometry selection validity state for pre/post-Evaluate behavior as a resource helper,
    not as a representation owner.
- `packages/dev/node-assets/src/index.ts` and `blockFoundation/blockRegistry.ts`
  - Export/register the three blocks.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `importNodeGeometry.test.ts` — ImportNodeGeometry produces a `NODE_GEOMETRY` resource and does
  not build/evaluate geometry.
- `evaluateNodeGeometry.test.ts` — Evaluate runs the procedural graph exactly once per build and
  produces a deterministic evaluated payload.
- `bakeNodeGeometry.test.ts` — Bake produces a `BabylonAsset` that is owned/disposed by build
  scope.
- `nodeGeometrySelections.test.ts` — selections are unresolved before Evaluate, valid after
  Evaluate, and invalidated with diagnostics if the evaluated topology changes.
- `proceduralGeometryPipeline.test.ts` — ImportNodeGeometry → Evaluate → Bake → Babylon2glTF →
  ExportGLTF builds a valid glb.

## Acceptance criteria

- [ ] `ImportNodeGeometry` outputs `NODE_GEOMETRY` and performs no geometry build.
- [ ] `EvaluateNodeGeometry` is explicit and evaluate-once.
- [ ] `BakeNodeGeometry` produces `BABYLON_SCENE` / `BabylonAsset`.
- [ ] NodeGeometry selection behavior is pre/post-Evaluate aware and never becomes a
      representation-domain selector.
- [ ] The full procedural geometry → Babylon → glTF path builds headlessly.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 02 — `NODE_GEOMETRY` kind and typed schema.
- Issue 03 — build scope lifecycle/evaluate-once resource ownership.
- Issue 06 — `BabylonAsset` and Babylon2glTF path for Bake output.

No outward PR/push — commit locally only.
