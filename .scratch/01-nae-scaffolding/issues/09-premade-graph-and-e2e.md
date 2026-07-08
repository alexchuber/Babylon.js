# 09 — Premade wired graph + BoomBox + Draco properties + e2e

Status: ready-for-agent

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (this is **Slice 4** of
that effort, the integration slice) · Glossaries: `packages/tools/nodeAssetsEditor/CONTEXT.md` (editor
terms) · `packages/dev/node-assets/CONTEXT.md` (runtime terms) · `CONTEXT-MAP.md`.

## User stories covered

Addendum stories 1 (opens to a wired example pipeline), 2 (BoomBox preloaded), 14 (remove a compression
node), 15 (add a compression node), 16 (reorder Draco/KTX2), 17 (tweak the Draco node in properties), 19
(both compression nodes first-class), 21 (editor e2e coverage).

## Why this is its own slice

This is the integration slice that makes the editor **demonstrate itself**: it composes the Draco WASM
fix (05), the Viewer V2 preview (07), and the auto-build scheduler (08) into the default experience the
user sees on open, and locks that experience in with end-to-end tests. It is the only slice that depends
on the other three.

## What to build

**Premade wired default graph.** Change the editor's starter graph from the current unconnected
Import + Export pair to a **wired** pipeline: `Import glTF → KTX2 Compress → Draco → Export glTF` (this
default order is the user's definition of done; the reorder/remove stories below prove the user can
change it).

**Default asset (BoomBox).** On open, fetch a default **BoomBox `.glb`** from the CDN (the Playground
`scenes/` path in the app; Playwright uses the `:1337` test CDN, which serves the same `scenes/` path)
and load its bytes into the Import block, so the pipeline has real content and auto-builds to a visible
result. With 05 + 07 + 08 in place, opening the editor should therefore build the Draco+KTX2 pipeline and
auto-preview the exported BoomBox with no errors.

**Draco property section.** Extend the editor's property-section builder to render a **Draco** section
(exposing the block's existing `method` / `encodeSpeed` / `decodeSpeed` / `quantizationBits` fields),
alongside the existing Import / Export / KTX2 sections. UI-only; no runtime behavior change.

**End-to-end tests.** Reshape the editor Playwright suite into the three Milestone-1-done flows, all
asserted on **DOM state + download events** (no gating pixel comparison):

1. **Opens to the premade graph and auto-previews.** The editor loads showing the wired
   `Import → KTX2 → Draco → Export` graph with BoomBox, the spinner appears then clears, the preview
   canvas is present, and no console error occurs.
2. **Export matches preview.** Selecting the Export node and clicking Export fires a `download` event
   yielding a valid `.glb`.
3. **Reorder / remove rebuilds.** Removing or reordering a compression node triggers a successful
   rebuild (spinner appears then clears; preview still renders).

## Acceptance criteria

- [ ] The editor opens to a **wired** `Import → KTX2 → Draco → Export` graph (not an unconnected pair).
- [ ] A default BoomBox `.glb` is fetched on open and loaded into the Import block.
- [ ] On open, the pipeline auto-builds and the preview shows the exported BoomBox with **no console
      error** (spinner appears then clears).
- [ ] Selecting the Draco node shows a properties section with its `method` / `encodeSpeed` /
      `decodeSpeed` / `quantizationBits` fields; editing them is reflected in the block.
- [ ] The user can remove, add, and reorder the Draco and KTX2 nodes and the graph still builds and
      previews correctly for each arrangement.
- [ ] Playwright flow 1 (opens → premade graph + auto-preview, no error) passes.
- [ ] Playwright flow 2 (export from the Export node → valid glb download) passes.
- [ ] Playwright flow 3 (reorder/remove a compression node → successful rebuild) passes.
- [ ] Headless `node-assets` unit tests remain green; `lint:check` + `format:check` pass.

## Blocked by

- `.scratch/01-nae-scaffolding/issues/05-draco-decoder-wasm-in-editor.md` (Draco WASM must work
  in-browser — the default graph contains a Draco node).
- `.scratch/01-nae-scaffolding/issues/07-preview-via-viewer-v2.md` (soft: the e2e should be written
  against the final Viewer V2 preview).
- `.scratch/01-nae-scaffolding/issues/08-auto-build-scheduler.md` (auto-preview-on-open and
  reorder/remove-rebuild require the scheduler).
