# 11 — Golden, fuzz, Playwright, visual, and security coverage

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US1–US16; AG8, AG9, AG10,
AG11, AG12, AG13) · ADRs: `docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**transcoder**, **LossRecord**, **build scope**,
**handedness**) and `packages/tools/nodeAssetsEditor/CONTEXT.md` (**gallery**, **preview**,
**diagnostics surfacing**).

## Goal

Add the final regression harness for milestone 07: golden fixtures for every transcoder, fuzz and
security coverage for untrusted input/failure disposal, and Playwright visualization coverage for
the eight demos.

## Why this is its own slice

This is broad verification over the integrated platform. It depends on the demos existing and
should not block feature slices from landing their focused unit tests.

## KISS ground rules (read first)

- This slice is coverage, not new runtime behavior except test-only seams needed to observe leaks.
- Use playgroundId-based visualization entries and reference images per repo convention.
- Every visual config entry needs a `dependsOn` array.
- Treat malformed assets as untrusted: fail-fast, no hang, no unbounded allocation, no leaked engine
  or scene.
- **Security acceptance pins the exact existing `tinyusdz` version (0.9.9)** (proven correct via API
  diff — both older and newer versions break the shipped transcoder). Do not bump, replace, or add a USD
  dependency as part of this coverage work.
- **`fast-check` is NOT assumed.** The **default** fuzz strategy is deterministic **corpus mutation of the
  existing hand-built fixtures** (byte-flip / truncation / field-drop), seeded, with a low fixed `numRuns`
  (25–50) in CI and higher locally. Adopting `fast-check` is a **new dev dependency** that must first clear
  the dependency gate's **7-step vetting methodology** (independent, early / Layer-0 prep) and is not added
  without explicit approval; if it doesn't clear cleanly, the deterministic corpus-mutation suite stands on
  its own. Fuzz the hand-rolled USD crate decoder + custom LZ4 path too.
- Model live-resource leak/disposal tests on Babylon's `@tools/memory-leak-tests` harness.
- **Do NOT add any `.github` CI workflow files** (or edit `.github`) without explicit user approval.
  Any CI wiring for these golden/fuzz/visual suites is recorded here as **deferred / proposed
  acceptance work only** — describe the intended workflow, do not create it.

## What to build

- Golden/runtime tests under `packages/dev/node-assets/test/unit/`
  - Golden fixtures for USD2glTF, USD2Babylon, glTF2Babylon, Babylon2glTF.
  - Golden expected `LossRecord` snapshots for known lossy fixtures.
  - Fuzz/malformed-input tests for USD parser inputs, glTF inputs, images, and transcoder boundaries.
  - Disposal-under-failure tests for BabylonAsset and large buffers.
  - **Handedness-boundary tests** that assert the three boundaries **independently**: the `BabylonAsset.
    scene` contract (`useRightHandedSystem`), the loader/root behavior where applicable, and the terminal
    GLB **Viewer preview** mode (Viewer default LH + glTF loader AUTO root conversion) — proving
    representation handedness is **never inferred from the preview** and vice versa.
- Loader fuzz/security tests under `packages/dev/loaders/test/unit/USD/`
  - Malformed crate/usda/usdz cases fail fast and do not hang.
- Editor tests under `packages/tools/nodeAssetsEditor/`
  - Diagnostics/LossRecord surfacing remains visible for gallery demo failures.
  - **Gallery E2E: no skipped/shell Playwright tests.** Enable the gallery specs and prove, against real
    `data-testid` hooks (e.g. `[data-testid=demo-gallery]`): query-param / catalog injection, selectors,
    card selection, graph loading, and pipeline execution. (Baseline on the abandoned branch was 4
    passed / 8 skipped and a forced-on shell failed at the missing `[data-testid=demo-gallery]` — this
    issue replaces that with real passing coverage.)
- Visualization:
  - Add entries to `packages/tools/tests/test/visualization/config.json` for the eight demos.
  - Use Playground snippets (`playgroundId`) created with the repo visual-testing snippet workflow.
  - Add reference images under
    `packages/tools/tests/test/visualization/ReferenceImages/`.
  - Each entry includes `dependsOn`, using tags such as `["Loaders", "glTF"]`,
    `["Loaders", "Meshes"]`, `["Materials", "Textures"]`, `["Rendering"]`, or
    `["Cameras"]` as appropriate to the demo.
  - **ToyCar fixture progression**: ship the **CC0 glTF ToyCar** baseline visualization test **now**; add
    a **USD ToyCar companion only after the USD import/preview surface exists**. Both go through the
    **mandatory Playground snippet / `playgroundId` flow** (create + save snippet, reference by id) — and
    **no snippet publish is performed in this work** (snippets are prepared, not published).
- **Firefox worker/transcoder budgets**:
  - Add a Firefox acceptance lane (a dedicated Playwright project for the editor, e.g.
    `nodeAssetsEditorFirefox`) scoped to **cheap / non-WASM demo graphs**; profile a per-transcoder
    Firefox-vs-Chrome wall-clock budget before assuming the existing 240s watchdog generalizes.
  - **Basis/Draco-heavy (synchronous-WASM) transcode paths stay Chromium-scoped** with their own budget;
    do not run them in the Firefox lane. Distinguish the two explicitly in the config/acceptance.

## Tests

Tests first:

- `packages/dev/node-assets/test/unit/transcoderGolden.test.ts` — all four transcoders produce
  stable, valid outputs on fixtures.
- `packages/dev/node-assets/test/unit/transcoderLossRecords.test.ts` — documented lossy fixtures
  emit expected `LossRecord`s.
- `packages/dev/node-assets/test/unit/untrustedInputFuzz.test.ts` — malformed bytes fail fast,
  never evaluate embedded code, and never allocate beyond configured limits.
- `packages/dev/node-assets/test/unit/disposalUnderFailure.test.ts` — parse/transcode failures
  dispose live engines/scenes/buffers exactly once.
- `packages/dev/loaders/test/unit/USD/usdMalformedInputFuzz.test.ts` — malformed USD inputs fail
  fast.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/galleryDiagnostics.test.ts` — demo diagnostics
  surface in editor UI state.
- `packages/tools/tests/test/visualization/config.json` entries pass for all eight demo titles in
  WebGL2 and WebGPU where applicable after snippets and baselines are created.

## Acceptance criteria

- [ ] Golden tests cover USD2glTF, USD2Babylon, glTF2Babylon, and Babylon2glTF.
- [ ] Fuzz/malformed-input tests cover USD/glTF/image/transcoder boundaries and fail fast.
- [ ] Disposal-under-failure tests prove no live engine/scene/large-buffer leak on fatal errors.
- [ ] Playwright visualization config has eight playgroundId-based demo entries with `dependsOn`
      tags and committed reference images.
- [ ] Visual tests pass for the targeted demo entries.
- [ ] Gallery Playwright specs are enabled (no skipped/shell tests) and prove query-param/catalog
      injection, selectors, card selection, graph loading, and pipeline execution against real
      `data-testid` hooks.
- [ ] A Firefox editor lane covers cheap/non-WASM graphs with a profiled budget; Basis/Draco-heavy
      synchronous-WASM paths stay Chromium-scoped with their own budget.
- [ ] The CC0 glTF ToyCar baseline visualization ships via the `playgroundId` flow (no publish); the USD
      ToyCar companion is deferred until the USD import/preview surface exists.
- [ ] Security pass confirms no dynamic code from assets and no unbounded allocation path.
- [ ] Security acceptance keeps the exact `tinyusdz` 0.9.9 pin (no dependency bump/replacement).
- [ ] CI workflow wiring is recorded as deferred/proposed only; no `.github` files are added without
      explicit user approval.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 10 — gallery and eight buildable demos.

No outward PR/push — commit locally only.
