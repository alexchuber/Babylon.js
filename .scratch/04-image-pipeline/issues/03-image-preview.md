# 03 — Image preview: show the produced image for an IMAGE pipeline

Status: ready-for-agent

## Parent

`.scratch/04-image-pipeline/PRD.md` (user story 11 — "a clear preview or reported result of the produced
image") · Glossary: `packages/tools/nodeAssetsEditor/CONTEXT.md` (**preview**: "the Babylon Viewer V2
loading the exported glb for a SCENE pipeline, **or the produced image for an IMAGE pipeline (milestone
04)**").

## Goal

When a graph terminates in an **ExportImage**, the editor **preview** shows the produced **image**
instead of the Viewer V2 glb path, so the author sees what their 2D pipeline made. SCENE pipelines
(terminating in ExportGLTF) still preview the glb, unchanged.

## Why this is its own slice

It is focused **editor-preview** work (`previewController.ts` + `PreviewPane.tsx`) with no runtime
dependency beyond the image bytes that issue 00's generalized build already produces. It is
independently landable and Playwright-testable, and separating it keeps issue 00 about the runtime +
palette wiring. It runs in **parallel** with the operation issues (01/02).

## The crux (read first): how the preview learns the payload kind

Today `PreviewController.loadAssetAsync(bytes)` assumes **glb** and calls `viewer.loadModel(...)`. For an
image result the preview must know it is an **image** (and ideally its `mimeType`) to render it. The
build result currently crosses a worker boundary as raw `Uint8Array`. Resolve this the **minimal** way:

- **Preferred:** have the terminal export block report the produced **kind / `mimeType`** alongside the
  bytes, and thread that hint through the build result to the preview. This is a small, honest addition
  that also future-proofs slice 06.
- **Acceptable fallback:** **sniff the magic bytes** (glTF `glTF`/`0x46546C67` magic vs PNG/JPEG/WebP
  signatures) in the preview to branch. No runtime signature change, at the cost of a small sniff.

Pick one; do **not** build a general MIME-negotiation layer.

## KISS ground rules (read first)

- **Branch on the produced payload kind**: image bytes → render an `<img>` from an object URL
  (`URL.createObjectURL` over a `Blob` of the bytes + `mimeType`); glb bytes → the existing Viewer V2
  path. One branch, no preview framework, and **release the object URL** on replace/detach.
- **Reuse the bytes as-is.** The build already returns encoded image bytes; do **not** re-decode via a
  canvas beyond building the object URL. (`preserveDrawingBuffer` on the preview engine stays available
  but unused here — PRD.)
- **"Clear preview OR reported result"** (PRD): a rendered image is the target; a **clear reported
  result** (dimensions / `mimeType` / success) shown in the pane status is the acceptable minimum if a
  full in-pane render is impractical.
- Keep the Viewer V2 lifecycle intact for the SCENE path; don't regress glb preview.

## What to build

- **`PreviewController`** — accept an image result (bytes + `mimeType`, per the crux decision): when the
  terminal export is an image, present the produced image (object URL) in the pane; otherwise keep the
  Viewer V2 glb path. Manage/revoke the object URL alongside the existing build/loading/error status.
- **`PreviewPane.tsx`** — render the `<img>` surface (or reported-result readout) for the image case and
  the Viewer canvas for the SCENE case, honoring the existing building/error status states.
- Surface the produced `mimeType` (and dimensions if readily available) as part of the preview's
  reported result.

## Tests

Editor **Playwright** (the preview needs the browser DOM):

- Load/build an `ImportImage → (op) → ExportImage` graph and assert the preview shows an **image** — an
  `<img>` element with a non-empty (object-URL) source — and reports the produced `mimeType`.
- A **SCENE** graph (`ImportGLTF → ExportGLTF`) still shows the **Viewer** surface, unchanged
  (regression).
- Prefer the existing editor Playwright seam and status-state assertions already used for the glb
  preview; keep them green.

## Acceptance criteria

- [ ] When a graph terminates in `ExportImage`, the preview displays the produced image (an `<img>` from
      an object URL over the result bytes + `mimeType`); the object URL is revoked on replace/detach.
- [ ] The preview learns the payload kind via the minimal path chosen in "the crux" (export-reported
      kind/`mimeType`, or magic-byte sniff) — no general MIME-negotiation layer is added.
- [ ] SCENE pipelines still preview the glb through Viewer V2, unchanged; building/error status states
      still work for both paths.
- [ ] The produced `mimeType` (and dimensions when available) are surfaced as the preview's reported
      result.
- [ ] A Playwright test shows an image for an IMAGE pipeline and the Viewer for a SCENE pipeline; both
      pass. `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (IMAGE lane foundation)** — needs `ExportImage` and the generalized build producing image
  bytes (and, for the preferred path, the export-reported kind/`mimeType`).
- Runs in **parallel** with issues 01 and 02; a single op from issue 01 (e.g. Resize) makes a more
  visible preview demo but is not required.
