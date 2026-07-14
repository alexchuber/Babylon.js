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
  - Build-owned `AbortController` / `AbortSignal` with cooperative abort checks.
  - Diagnostics and `LossRecord` collection.
  - **Explicit configurable limits** — per-source-asset bytes, total-source bytes, block/evaluation count,
    wall-clock timeout — with **behavior-safe defaults** (existing graphs must not start failing); each
    raises a clear typed error on exceed.
  - Lifetime ledger with idempotent register/dispose semantics.
  - Helpers for registering `GltfAsset`, `UsdAsset`, `BabylonAsset`, `NodeGeometryAsset`, resources, and
    scalars.
- `packages/dev/node-assets/src/nodeAsset.ts`
  - Change `buildAsync()` to `buildAsync(signal?: AbortSignal)`; create one build scope per build wired to
    that signal.
  - Pass the scope through pull-evaluation.
  - **Sibling-abort-on-first-failure**, await full settlement/cleanup before resolving or rejecting, and
    surface **one deterministic primary error** even under concurrent failures.
  - **Fix the pre-existing `Promise.all` sibling-race in `_doEvaluateBlockAsync`** so a failed branch
    cannot orphan a sibling promise that holds a live `BabylonAsset`/`NodeGeometryAsset`; use all-settled
    sibling handling tied to the build scope's disposal ledger.
- `packages/dev/node-assets/src/blockFoundation/nodeAssetBlock.ts`
  - Thread build-scope access into `_buildBlockAsync` without breaking existing blocks.
- `packages/dev/node-assets/src/blockFoundation/exportBlock.ts`
  - Return build result diagnostics alongside exported payload where existing callers can consume them
    compatibly.
- `packages/dev/node-assets/src/evaluation/fanOutCopy.ts`
  - Replace SCENE-only clone logic with a **four-way** per-kind dispatch:
    `GltfAsset` structural-clones with `cloneDocument`, `UsdAsset` shares the frozen stage + copies the
    immutable overlay, `BabylonAsset` rejects implicit fan-out (LossyFork only), and `NodeGeometryAsset`
    clones via **serialize / no-build parse**. Scalars/`Image` share by reference.
- `packages/dev/node-assets/src/index.ts` exports build-scope public types needed by tests/editor.

## Tests

Tests first under `packages/dev/node-assets/test/unit/`:

- `buildScopeLifecycle.test.ts` — resources are disposed exactly once on success, fatal failure,
  cancellation, and limit abort.
- `buildScopeCancellation.test.ts` — `buildAsync(signal)` abort and first-fatal-error both trigger
  sibling-abort; awaited all-settled cleanup still disposes already-produced outputs; concurrent failures
  surface **one deterministic primary error**.
- `buildLimits.test.ts` — each of the four limits (per-source bytes, total-source bytes,
  block/evaluation count, wall-clock) raises a clear typed error on exceed with verified cleanup, and
  **every current fixture still builds under the behavior-safe defaults**.
- `fanOutPolicy.test.ts` — **four-way dispatch**: `GltfAsset` structural-clones, `UsdAsset` shares the
  frozen immutable stage and copies overlays, `BabylonAsset` throws a clear affine-policy diagnostic (no
  implicit clone), `NodeGeometryAsset` clones via serialize / no-build parse.
- `siblingRace.test.ts` — a failing branch does not orphan a sibling that holds a live
  engine/scene/`NodeGeometryAsset`; the sibling is disposed via all-settled cleanup (regression for the
  `_doEvaluateBlockAsync` race).
- `nodeAsset.test.ts` update — evaluate-once memo still dedupes concurrent fan-in.
- `lossRecordDiagnostics.test.ts` — non-fatal diagnostics collect on the scope; fatal errors still
  fail the build.

## Acceptance criteria

- [ ] `buildAsync(signal?: AbortSignal)` creates and owns a build scope for each build; abort and
      first-fatal both trigger sibling-abort with one deterministic primary error.
- [ ] Cancellation, the four explicit limits with behavior-safe defaults, diagnostics, and lifetime
      ledger are implemented in `evaluation/buildScope.ts`; every current fixture builds under defaults.
- [ ] All registered representation/resource payloads are disposed exactly once on success and abort.
- [ ] Fan-out policy is the four-way dispatch; Babylon fan-out is affine (never implicitly cloned) and
      `NodeGeometryAsset` clones via serialize / no-build parse.
- [ ] Existing glTF-only graphs still build through the new scope.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 02 — typed representation wrappers and connection point kinds.

No outward PR/push — commit locally only.
