# 04 — Compose-up showcase premade graph + e2e (bare glTF + image → textured glTF, with preview)

Status: ready-for-agent

## Parent

`.scratch/06-extract-and-recompose/PRD.md` (user stories 7, 8, 9) · Glossaries:
`packages/dev/node-assets/CONTEXT.md` (**BuildPBRMaterial**: "the 'compose up the funnel' tool") +
`packages/tools/nodeAssetsEditor/CONTEXT.md` (**preview**: "the Babylon Viewer V2 loading the exported glb
for a SCENE pipeline") · Decision:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (import → compose → export all funnel through the
SCENE spine). Prior art: milestone-1's premade-graph / auto-preview e2e (the editor's existing starter
graph `Import → KTX2 → Draco → Export` seeded with BoomBox, and its Playwright coverage).

## Goal

Ship the **compose-up showcase**: a bundled example graph that takes a **bare, untextured `.glb`** plus an
**image** and assembles a **finished, textured glTF** — `ImportGLTF` (bare mesh) + `ImportImage` →
`BuildPBRMaterial` (base colour = the image), assigned to the mesh → `ExportGLTF`. Make it the editor's
ready-made graph so an author opens NAE and sees the whole extract/recompose story working end to end,
with the existing glb **preview** showing the recomposed, textured asset. Lock it in with an e2e that
builds the graph and asserts a textured asset comes out.

## Why this is its own slice

It is the **dramatization** layer — bundled asset + premade-graph wiring + e2e + preview — over the runtime
blocks (issue 03, and the slice-04 IMAGE boundary). Separating it keeps issue 03 about the block and this
issue about the end-to-end demo. It mirrors slice-04's split of operations from the preview/showcase, and
reuses milestone-1's premade-graph machinery rather than inventing new infrastructure.

## KISS ground rules (read first)

- **Reuse the existing premade-graph mechanism.** The editor already seeds a starter graph and auto-loads a
  default asset (`nodeAssetGraphController.ts`: the `Import → KTX2 → Draco → Export` starter +
  `loadDefaultImportAsync`, and the Playwright `DefaultPipeline` check). **Extend/replace** that wiring for
  the compose-up graph — do **not** build a second premade-graph framework.
- **A tiny bundled `.glb`, no new importer.** The bare-mesh source is a small untextured `.glb` served
  alongside the existing default asset (like `scenes/BoomBox.glb`). No new loader / importer is needed
  (PRD). Vet any bundled asset's licence/provenance.
- **No new preview code.** The showcase terminates in `ExportGLTF`, so the output is a glb — the **existing**
  Viewer V2 glb preview (milestone 1) already renders it. This issue **reuses** that path; it does **not**
  add image-preview handling (that was slice-04 issue 03, for `ExportImage` pipelines). Just confirm the
  recomposed textured asset shows up.
- **Don't re-solve the blocks here.** BuildPBRMaterial / ImportImage / ImportGLTF / ExportGLTF are provided
  by issue 03 and slices 02/04; this issue only wires and demonstrates them.

## What to build

- **Bundled bare-mesh asset** — a tiny untextured `.glb` (a cube/plane/simple mesh) served with the
  editor's sample assets, plus a bundled source image for the base colour. Reference them the same way the
  default BoomBox URL is resolved.
- **Premade compose-up graph** — replace/augment the seeded starter graph so the ready-made graph is:

  ```text
  ImportGLTF(bare .glb) ─┐
                         ├─► BuildPBRMaterial(baseColor = image, target = mesh material slot) ─► ExportGLTF
  ImportImage(image) ────┘
  ```

  Seed the two import blocks with the bundled assets (as `loadDefaultImportAsync` does today), and pre-wire
  BuildPBRMaterial's `baseColor` input + target pointer so the graph builds on open. Keep the option to fall
  back to (or offer) the old compression starter if the editor wants both, but the **compose-up graph is the
  showcase**.
- **Preview** — on open/auto-build, the existing glb preview shows the recomposed textured mesh; no preview
  code changes.

## Tests

Two tiers, per the PRD's Testing Decisions:

- **Headless showcase build (`buildAsync()`, primary seam)** — construct the compose-up graph in code with
  the bundled bare `.glb` + image, `buildAsync()`, re-parse the exported glb, and assert: the output has a
  **PBR material with a baseColor texture**, the material/texture **counts** are as expected, and the
  **target mesh references** the built material. This is the canvas-free heart of the showcase.
- **Editor Playwright e2e** — reuse the existing premade-graph coverage
  (`packages/tools/nodeAssetsEditor/test/playwright/nodeAssetsEditor.test.ts`): opening the editor loads the
  compose-up premade graph (assert the wired pipeline), auto-builds without console errors, and the
  **preview shows the recomposed textured asset** (the existing BoomBox-style auto-preview assertion,
  retargeted to the compose-up output). Canvas-dependent steps live here, not in the headless seam.

## Acceptance criteria

- [ ] A tiny **untextured `.glb`** and a source **image** are bundled with the editor's sample assets
      (licence/provenance vetted) and resolved like the existing default asset.
- [ ] The editor's ready-made graph is the **compose-up** graph — `ImportGLTF(bare)` + `ImportImage` →
      `BuildPBRMaterial(baseColor = image, target = mesh)` → `ExportGLTF` — seeded and pre-wired so it
      builds on open, reusing the existing premade-graph / default-asset mechanism (no second framework).
- [ ] The existing glb **preview** shows the recomposed textured asset on auto-build; **no** new preview
      code is added (SCENE pipeline → existing Viewer V2 glb path).
- [ ] A headless `buildAsync()` test asserts the exported asset is a textured glTF (PBR material + baseColor
      texture, expected material/texture counts, target mesh → material assignment).
- [ ] The editor Playwright e2e loads the compose-up premade graph, auto-builds without console errors, and
      asserts the recomposed textured asset previews; existing editor Playwright tests stay green.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 03 (BuildPBRMaterial)** — the showcase graph is built around it. **Hard block.**
- **slice-04 issue 00 — `00-image-lane-foundation.md`** for `ImportImageBlock` (the image source in the
  graph). **Hard block.** *(On branch `alexchuber-issue-ify-slice-04`, not yet on dev; reference by
  intent.)*
- **slice 02** (SCENE spine, `ImportGLTF` / `ExportGLTF`, self-registration, the premade-graph +
  auto-preview machinery from milestone 1) must have **landed**. **Hard block.**
- **Not** hard-blocked by the extract/set pair (issues 00–02): the compose-up showcase uses BuildPBRMaterial,
  not ExtractTexture/SetTexture. (Those power the *reprocess-in-place* round-trip story, validated by their
  own tests in issues 01/02.)

## Note for whoever merges

This touches the same premade-graph / default-asset wiring in `nodeAssetGraphController.ts` and the
Playwright `DefaultPipeline` fixture that milestone 1 established — expect the main churn to be the seeded
graph definition and the e2e's expected-pipeline list, not new infrastructure.
