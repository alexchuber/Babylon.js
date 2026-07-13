# 03 — Build scope, cancellation, and lifecycle

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US10, US11, US14; AG3, AG4,
AG10, AG13) · ADR: `docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md` ·
Glossary: `packages/dev/node-assets/CONTEXT.md` (**build scope**, **evaluate-once /
copy-on-fan-out**, **GltfAsset / UsdAsset / BabylonAsset**, **LossRecord**).

## Goal

Add a per-`buildAsync()` build scope that owns cancellation, fail-fast abort, resource/time limits,
diagnostics, fan-out policy, and single-disposal of representation resources.

## Why this is its own slice

Lifecycle is cross-cutting and must be settled before USD/Babylon/NodeGeometry blocks create live or
large resources. Keeping it independent lets later slices register resources instead of inventing
their own cleanup rules.

## KISS ground rules (read first)

- Preserve existing pull-evaluation and evaluate-once semantics in `nodeAsset.ts`.
- Build scope owns resources; blocks register outputs and do not dispose them ad hoc.
- Fan-out policy is explicit per kind: glTF clone, USD share, Babylon affine.
- Abort/failure cleanup must use all-settled sibling cleanup; never leak a produced sibling because
  another branch failed.

## What to build

- New `packages/dev/node-assets/src/evaluation/buildScope.ts`
  - Build-owned `AbortSignal`.
  - Diagnostics and `LossRecord` collection.
  - Resource/time limit tracking.
  - Lifetime ledger with idempotent register/dispose semantics.
  - Helpers for registering `GltfAsset`, `UsdAsset`, `BabylonAsset`, resources, and scalars.
- `packages/dev/node-assets/src/nodeAsset.ts`
  - Create one build scope per `buildAsync()`.
  - Pass the scope through pull-evaluation.
  - Abort siblings on first fatal error and dispose all registered resources exactly once.
- `packages/dev/node-assets/src/blockFoundation/nodeAssetBlock.ts`
  - Thread build-scope access into `_buildBlockAsync` without breaking existing blocks.
- `packages/dev/node-assets/src/blockFoundation/exportBlock.ts`
  - Return build result diagnostics alongside exported payload where existing callers can consume them
    compatibly.
- `packages/dev/node-assets/src/evaluation/fanOutCopy.ts`
  - Replace SCENE-only clone logic with per-kind policy:
    `GltfAsset` clones with `cloneDocument`, `UsdAsset` shares frozen stage + copies overlay,
    `BabylonAsset` rejects implicit fan-out and points users to LossyFork.
- `packages/dev/node-assets/src/index.ts` exports build-scope public types needed by tests/editor.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `buildScopeLifecycle.test.ts` — resources are disposed exactly once on success, fatal failure,
  cancellation, and limit abort.
- `buildScopeCancellation.test.ts` — first fatal error aborts in-flight siblings and awaited
  all-settled cleanup still disposes already-produced outputs.
- `fanOutPolicy.test.ts` — `GltfAsset` fan-out clones, `UsdAsset` fan-out shares immutable stage and
  copies overlays, `BabylonAsset` fan-out throws a clear affine-policy diagnostic.
- `nodeAsset.test.ts` update — evaluate-once memo still dedupes concurrent fan-in.
- `lossRecordDiagnostics.test.ts` — non-fatal diagnostics collect on the scope; fatal errors still
  fail the build.

## Acceptance criteria

- [ ] `buildAsync()` creates and owns a build scope for each build.
- [ ] Cancellation, fail-fast abort, resource/time limits, diagnostics, and lifetime ledger are
      implemented in `evaluation/buildScope.ts`.
- [ ] All registered representation resources are disposed exactly once on success and abort.
- [ ] Fan-out policy is representation-specific; Babylon fan-out is affine and never implicitly
      cloned.
- [ ] Existing glTF-only graphs still build through the new scope.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 02 — typed representation wrappers and connection point kinds.

No outward PR/push — commit locally only.
