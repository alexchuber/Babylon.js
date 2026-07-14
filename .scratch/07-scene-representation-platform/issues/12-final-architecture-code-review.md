# 12 — Final architecture and code review pass

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US1–US16; AG1–AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**representation**, **transcoder**, **build scope**,
**LossRecord**, **selection**, **GltfAsset / UsdAsset / BabylonAsset**, **affine**,
**Evaluate / Bake**) and `packages/tools/nodeAssetsEditor/CONTEXT.md` (**gallery**,
**diagnostics surfacing**, **palette**).

## Goal

Perform the final milestone-07 architecture cleanup and code review pass: verify the implemented
platform matches the PRD/ADRs, remove accidental scope creep, run full quality gates, and leave the
work ready for human review.

## Why this is its own slice

After eleven implementation/coverage slices, this pass checks cross-slice consistency that no
single feature branch can guarantee.

## KISS ground rules (read first)

- Review and cleanup only; do not add new platform features.
- Enforce the non-goals: no implicit conversion, generic representation wire, union/`Switch`,
  mandatory hub, path planner, USD/Babylon export terminal, or new third-party runtime dependency.
- Keep compatibility: `SCENE` alias, legacy tinyusdz path, legacy BuildPBRMaterial path, glTF
  operators/Merge, and Draco/BasisU class names.
- Use the repo's code-review skill/process for the final pass.

## What to build

- Architecture audit across:
  - `packages/dev/node-assets/src/connection/nodeAssetConnectionPointType.ts`
  - `packages/dev/node-assets/src/connection/nodeAssetConnectionPoint.ts`
  - `packages/dev/node-assets/src/representations/`
  - `packages/dev/node-assets/src/evaluation/buildScope.ts`
  - `packages/dev/node-assets/src/evaluation/fanOutCopy.ts`
  - `packages/dev/node-assets/src/selection/selection.ts`
  - `packages/dev/node-assets/src/Blocks/`
  - `packages/dev/node-assets/src/examples/`
  - `packages/tools/nodeAssetsEditor/src/nodeAssets/`
  - `packages/tools/nodeAssetsEditor/src/nodeGraph/`
  - `packages/tools/tests/test/visualization/config.json`
- Verify:
  - Exactly three 3D representation kinds and `NODE_GEOMETRY` resource kind.
  - Exactly four v1 transcoders; USD2glTF is genuinely direct (Babylon adapter never called).
  - glTF is the only 3D export terminal.
  - Build scope owns lifecycle/disposal/diagnostics/transferables; the `_doEvaluateBlockAsync`
    sibling-race is fixed.
  - Selections are domain-owned/versioned (correlated union) and mutators remap/invalidate.
  - Eight demos exist and match the PRD.
  - Editor review criteria (R10.4–R10.10) hold: one canonical `DemoCatalog` + view-model adapter,
    explicit serialized-graph type (no `ReturnType`-of-`any`), source/target-vs-policy metadata,
    recursive JSON type, no skipped/shell Playwright tests, Fluent/theme color tokens, list/diagram a11y
    semantics. The abandoned editor branch is not used as a foundation.
- Update directly related docs only if implementation names differ from the issues/PRD in an
  approved, intentional way.
- Run final review and fix high-confidence defects found by the review.

## Tests

Tests first / verification gates:

- Run the full relevant suite before cleanup to establish baseline:
  - `npm run format:check`
  - `npm run lint:check`
  - `npm run test:unit`
- Run targeted visualization demo tests from
  `packages/tools/tests/test/visualization/config.json` for the eight demo titles.
- Add or update only missing regression tests needed to prove a found cross-slice bug.
- Run the repo code-review skill against the final diff and address blocking/high-confidence
  findings.

## Acceptance criteria

- [ ] AG1–AG13 are traceable to tests, demos, or explicit review notes.
- [ ] The implementation has exactly three first-class 3D representations and exactly four
      transcoders.
- [ ] All PRD non-goals are still absent.
- [ ] Compatibility paths still work: `SCENE` alias, legacy tinyusdz ImportUSD, legacy
      BuildPBRMaterial, operators/Merge, Draco/BasisU class names.
- [ ] Final architecture/code review has no unresolved blocking findings.
- [ ] Targeted visual demo tests pass or any environment-only failures are documented with evidence.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issues 01–11 — all prior slices must be complete.

No outward PR/push — commit locally only.
