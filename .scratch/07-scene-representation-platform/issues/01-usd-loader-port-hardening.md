# 01 — USD loader port and hardening

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US1, US3, US11, US13; AG2, AG8,
AG9, AG12, AG13) · ADRs: `docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**import block**, **UsdAsset**, **LossRecord**,
**handedness**) and `packages/tools/nodeAssetsEditor/CONTEXT.md` (**diagnostics
surfacing**).

## Goal

Port the dependency-free USD loader branch into this branch and harden the loader surface that
milestone 07 depends on: frozen resolved stages, injectable fetchers for worker use, stable
diagnostic data, and preserved right-handed Babylon adaptation.

## Why this is its own slice

All USD-stage import and USD transcoders depend on the loader being present and trustworthy.
Keeping the port separate avoids mixing loader correctness with NodeAssets representation wiring.

## KISS ground rules (read first)

- Port the existing loader; do not redesign USD parsing or add a new USD dependency.
- Keep the tinyusdz NodeAssets path compatibility-only; do not delete it.
- Harden plain-data contracts and fetcher injection before any NodeAssets block consumes the loader.
- Preserve the adapter's right-handed-scene behavior; no per-vertex/index coordinate flips.

## What to build

- Port from external branch `alexchuber-feat-loaders-usd-loader` into
  `packages/dev/loaders/src/USD/`, including:
  - `resolution/resolvedStage.ts`
  - `resolution/usdResolver.ts`
  - `adapter/usdAdapter.ts`
  - parser/composition/mapping/adapter submodules needed by those files.
- In `packages/dev/loaders/src/USD/resolution/resolvedStage.ts`, make the
  `IResolvedStage` / `IResolvedDiagnostic` plain-data contract explicit and add runtime
  freeze/immutability hardening for resolved stages and nested arrays/records.
- In `packages/dev/loaders/src/USD/resolution/usdResolver.ts`, keep
  `ResolveUsdStageWithFetcherAsync` as the worker-safe injectable-fetcher seam and ensure
  `ResolveUsdStageAsync` is only the Babylon `Tools.LoadFileAsync` convenience wrapper.
- In `packages/dev/loaders/src/USD/adapter/usdAdapter.ts`, preserve
  `AdaptResolvedStageToScene` as the USD2Babylon engine, including
  `scene.useRightHandedSystem = true` and root-only up-axis/unit conversion.
- Keep diagnostics as plain `{ severity, message, path? }` data so NodeAssets can refine them into
  `LossRecord`s later.
- Do not touch NodeAssets runtime blocks in this issue except any import path updates needed for
  compilation.

## Tests

Tests first, porting existing coverage before hardening:

- `packages/dev/loaders/test/unit/USD/resolvedStageImmutability.test.ts` — resolved stages,
  diagnostics, nested arrays, and pooled meshes/materials are frozen or otherwise mutation-safe.
- `packages/dev/loaders/test/unit/USD/usdResolverFetcher.test.ts` — external asset resolution can
  use an injected fetcher without `Tools.LoadFileAsync`; the convenience wrapper still works.
- `packages/dev/loaders/test/unit/USD/usdAdapterHandedness.test.ts` — adapting a Y-up and Z-up
  fixture creates a right-handed scene, applies only root up-axis/unit correction, and does not
  flip authored mesh indices.
- Port the branch's existing `packages/dev/loaders/test/unit/USD/` parser, composition, mapper,
  and adapter tests; keep the ~81-case coverage intact.

## Acceptance criteria

- [ ] `packages/dev/loaders/src/USD/` is ported from `alexchuber-feat-loaders-usd-loader`.
- [ ] `IResolvedStage` is mutation-safe at runtime and remains plain data with no Babylon imports.
- [ ] USD resolving has a documented injectable-fetcher seam for workers; Babylon `Tools` is only
      the default convenience path.
- [ ] `AdaptResolvedStageToScene` remains the USD2Babylon engine and preserves right-handed
      scenes without per-vertex/index flips.
- [ ] Existing USD loader tests plus new immutability/fetcher/handedness tests pass.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- External branch `alexchuber-feat-loaders-usd-loader` — **hard dependency** for the loader source
  and tests.

No outward PR/push — commit locally only.
