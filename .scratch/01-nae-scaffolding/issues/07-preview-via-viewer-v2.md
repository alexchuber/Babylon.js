# 07 — Preview via Babylon Viewer V2, docked bottom-right

Status: ready-for-agent

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (this is **Slice 2** of
that effort) · Glossaries: `packages/tools/nodeAssetsEditor/CONTEXT.md` (editor terms) · `CONTEXT-MAP.md`.

## User stories covered

Addendum stories 4 (preview shows the true exported output via the Babylon Viewer) and 10 (preview
docked bottom-right).

## Why this is its own slice

It swaps the editor's preview implementation and its dock location — a self-contained, demoable change
that doesn't need the premade graph, the auto-build scheduler, or the Draco fix. It can be built in
parallel with issues 05 and 08.

## What to build

Replace the editor's hand-rolled preview (its own `Engine` + `Scene` + append-scene loading) with the
**Babylon Viewer V2 programmatic API**: create a viewer bound to the editor's **own** preview canvas
(`CreateViewerForCanvas(canvas, …)`) and load each freshly-exported `.glb` into it via
`viewer.loadModel(bytes)` (the Viewer accepts an in-memory binary view). Keep the editor's own preview
pane and canvas element — do **not** adopt the `<babylon-viewer>` web-component chrome. Lean on the
Viewer's built-in load abort / supersede so a newer load cancels an in-flight one.

Also move the preview pane to the **right / bottom** dock slot (beneath the Properties pane), vacating
the left / bottom slot.

The observable behavior is unchanged from the user's point of view except that the preview is now the
real Viewer V2 and sits bottom-right: importing/exporting a model still shows it rendered in the preview.

## Acceptance criteria

- [ ] The preview renders an exported `.glb` using Viewer V2 (`CreateViewerForCanvas` +
      `viewer.loadModel`), bound to the editor's own canvas; the old hand-rolled Engine/Scene preview
      path is removed.
- [ ] The preview pane is docked **bottom-right** (under Properties); the left/bottom slot no longer
      hosts the preview.
- [ ] Loading a new model supersedes an in-flight load (no stale model flashes in when two loads race).
- [ ] The existing editor Playwright preview assertions still pass (the preview canvas is present and
      shows the imported/exported model).
- [ ] `lint:check` + `format:check` pass; headless unit tests remain green.

## Blocked by

None — can start immediately. (Runs in parallel with issues 05 and 08; it is a blocker for issue 09.)
