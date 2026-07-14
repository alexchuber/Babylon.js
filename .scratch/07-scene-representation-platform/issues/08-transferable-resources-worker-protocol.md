# 08 — Transferable resources and worker protocol

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US11, US14; AG3, AG10, AG13) ·
ADR: `docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**build scope**, **GltfAsset / UsdAsset /
BabylonAsset**, **LossRecord**) and `packages/tools/nodeAssetsEditor/CONTEXT.md` (**graph
controller**, **preview**, **diagnostics surfacing**).

## Goal

Define and implement the single worker serialization boundary for NodeAssets builds so large inputs
move as transferables and build-scope diagnostics/lifetime behavior survives the editor worker hop.

## Why this is its own slice

The protocol is cross-cutting but can be built once the build scope exists. It should not be
hidden inside individual import blocks or editor code paths.

## KISS ground rules (read first)

- Build scope owns the transferable protocol; blocks do not invent ad hoc serialization.
- Transfer large buffers; do not copy them when worker APIs support transfer.
- Keep representation payloads typed at the boundary; do not introduce a generic representation
  wire.
- Preserve cancellation, diagnostics, and disposal semantics across the worker.

## What to build

- `packages/dev/node-assets/src/evaluation/buildScope.ts`
  - Add transferable registration and serialization helpers for large `ArrayBuffer`/typed-array
    inputs and representation payload metadata.
  - Define protocol data shapes for worker requests/results, diagnostics, and transfer lists.
- New optional helper module if useful:
  - `packages/dev/node-assets/src/evaluation/workerProtocol.ts`
- `packages/dev/node-assets/src/nodeAsset.ts`
  - Expose a headless build entry usable by the editor worker with transfer lists and cancellation.
- Editor worker files:
  - `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetBuildWorkerCore.ts`
  - `packages/tools/nodeAssetsEditor/src/buildScheduler.ts`
  - `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetGraphController.ts`
  Thread transferables, cancellation, diagnostics, and build result metadata through the existing
  worker/scheduler flow.
- Do not modify unrelated editor palette/descriptors in this issue.

## Tests

Tests first:

- `packages/dev/node-assets/test/unit/workerProtocol.test.ts` — large buffers are listed as
  transferables, representation metadata round-trips, and no generic representation kind appears.
- `packages/dev/node-assets/test/unit/buildScopeCancellation.test.ts` update — worker-style abort
  uses the same fail-fast and disposal path.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetBuildWorkerCore.test.ts` — worker core
  receives a transferred buffer, runs a build, returns diagnostics/LossRecords, and does not clone
  large payloads.
- `packages/tools/nodeAssetsEditor/src/buildScheduler.test.ts` — cancelling a scheduled build
  aborts the worker request and surfaces a diagnostic instead of leaking a pending preview.

## Acceptance criteria

- [ ] Build scope defines the worker protocol and transfer list generation.
- [ ] Large buffers cross the worker boundary as transferables where supported.
- [ ] Build diagnostics and `LossRecord`s round-trip through the worker result.
- [ ] Cancellation through the editor worker uses the same build-scope abort/disposal path.
- [ ] No block-specific or representation-generic serialization side channel is introduced.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 03 — build scope lifecycle, diagnostics, and cancellation.

No outward PR/push — commit locally only.
