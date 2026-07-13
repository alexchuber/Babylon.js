# 10 — Gallery and the eight demos

Status: ready-for-agent

## Parent

`.scratch/07-scene-representation-platform/PRD.md` (US1–US16, especially US15;
AG2, AG4, AG5, AG6, AG7, AG8, AG9, AG11, AG13) · ADRs:
`docs/adr/0004-three-first-class-representations.md`,
`docs/adr/0005-typed-representation-payloads-and-build-lifecycle.md`,
`docs/adr/0006-domain-owned-versioned-selections.md` · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**NodeAsset**, **representation**, **transcoder**,
**Evaluate / Bake**, **LossyFork**) and `packages/tools/nodeAssetsEditor/CONTEXT.md`
(**gallery**, **preview**, **palette**).

## Goal

Add the editor gallery and runtime example graphs for the PRD's eight demos, with each demo
openable, buildable headlessly, and ready for visual/golden coverage in issue 11.

## Why this is its own slice

The demos are integration artifacts over already-landed blocks. They should prove the platform
works end to end without expanding the runtime surface.

## KISS ground rules (read first)

- Implement exactly the eight demos listed in the PRD; do not add extra demos.
- Demos are examples, not hidden feature logic.
- Keep fixtures small and deterministic.
- Visual snippets/reference images are issue 11; this issue prepares buildable graphs.
- **One canonical production `DemoCatalog` source** drives the gallery, with a typed view-model adapter
  for the UI. Tests and UI derive from the same catalog — no independent UI/schema/Playwright catalogs.
- **Do not revive the abandoned editor/gallery branch** as a foundation; it is reference-only and failed
  its own forced-on E2E at a missing `[data-testid=demo-gallery]` (baseline 4 passed / 8 skipped). Build
  the gallery fresh against landed runtime block contracts.
- Gallery card / graph-preview UI uses **list / diagram accessibility semantics** and **hides decorative
  glyphs** from the a11y tree.

## What to build

- `packages/dev/node-assets/src/examples/`
  Add eight example graph definitions:
  1. USD → glTF delivery: ImportUSD → USD2glTF → Apply Draco → Apply BasisU → ExportGLTF.
  2. USD → Babylon preview: ImportUSD → USD2Babylon → preview metadata.
  3. glTF ↔ Babylon round-trip: ImportGLTF → glTF2Babylon → Babylon edit → Babylon2glTF →
     ExportGLTF.
  4. USD overlay edit → glTF: ImportUSD → USD selection overlay → USD2glTF → ExportGLTF.
  5. Cross-representation material recompose: ImportGLTF → ExtractTexture → ResizeImage →
     BuildPBRMaterial (glTF-targeting) → ExportGLTF.
  6. Procedural geometry → Babylon → glTF: ImportNodeGeometry → Evaluate → Bake →
     Babylon2glTF → ExportGLTF.
  7. Compose + fan-in: MergeScenes(ImportGLTF, USD2glTF(ImportUSD)) → prune → ExportGLTF.
  8. Affine fork + handedness fidelity: ImportGLTF → glTF2Babylon → LossyFork → two edits →
     Babylon2glTF ×2 → ExportGLTF.
- `packages/dev/node-assets/src/index.ts`
  - Export gallery/example graph helpers.
- Editor gallery plumbing in `packages/tools/nodeAssetsEditor/src/nodeAssets/`
  - A single canonical `DemoCatalog` source (e.g. `demoCatalog.ts`) + a typed view-model adapter; the
    gallery UI and all tests consume it — no parallel catalogs.
  - Add gallery entries that open these example graphs in Node Assets Editor, behind real `data-testid`
    hooks (e.g. `[data-testid=demo-gallery]`) so E2E in issue 11 can drive them.
  - Ensure preview uses the existing glTF terminal output or Babylon preview metadata where
    applicable.
- Keep each example's declared expected diagnostics/LossRecords near the example definition so
  tests and issue 11 can reuse them.

## Tests

Tests first:

- `packages/dev/node-assets/test/unit/galleryExamples.test.ts` — exactly eight examples exist with
  stable ids/titles matching the PRD.
- `packages/dev/node-assets/test/unit/galleryDemoBuilds.test.ts` — each example builds headlessly
  or produces its expected preview payload/diagnostics.
- `packages/dev/node-assets/test/unit/galleryDemoLossRecords.test.ts` — demos that transcode lossy
  fixtures emit expected `LossRecord` categories.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/gallery.test.ts` — gallery lists exactly the
  eight demos and opens each into editor state.
- `packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetGraphController.test.ts` update —
  opened demo graphs can build through the controller.

## Acceptance criteria

- [ ] Runtime examples include exactly the eight PRD demos.
- [ ] Editor gallery lists and opens exactly those eight demos.
- [ ] Every demo builds headlessly or reports the expected preview payload and diagnostics.
- [ ] Demo fixtures are small, deterministic, and reusable by issue 11.
- [ ] One canonical `DemoCatalog` + typed view-model adapter drives gallery UI and tests (no parallel
      catalogs); gallery exposes real `data-testid` hooks.
- [ ] Gallery cards / graph preview use list/diagram a11y semantics and hide decorative glyphs.
- [ ] The abandoned editor/gallery branch is not used as an implemented foundation.
- [ ] Demo copy/labels never claim "native right-handed Babylon" unless the demo actually exercises the
      runtime path that produces a right-handed `BabylonAsset` (preview rendering alone is not proof).
- [ ] No extra runtime transcoders, export terminals, hub, path planner, or generic wire are added.
- [ ] test:unit passes
- [ ] format:check + lint:check pass

## Blocked by

- Issue 04 — glTF operators/materials/selections.
- Issue 05 — USD import, overlays, and USD transcoders.
- Issue 06 — Babylon transcoders, LossyFork, handedness.
- Issue 07 — NodeGeometry import/Evaluate/Bake.
- Issue 09 — editor descriptors, palette, diagnostics surfacing.

No outward PR/push — commit locally only.
