# PRD — 04 Image pipeline

> Milestone 04 of the NodeAssets POC. Opens a second payload lane — 2D images — alongside the SCENE
> spine, proving the "any type of input" breadth goal. Cross-lane wiring (images ↔ scenes) is slice 06;
> this slice makes the image lane stand on its own.

## Problem Statement

NodeAssets only understands SCENE payloads, but a huge amount of real asset-prep work is 2D: resizing
a hero image into a responsive set, converting PNG→WebP, compositing a watermark or badge onto a
texture, normalising formats before they go on the web. As a pipeline author I have images as inputs
and want web-ready images as outputs, using the same visual, composable graph I use for 3D — not a
separate tool. Today there is no IMAGE payload, no image source or sink, and no image operations.

## Solution

Add an **IMAGE** payload kind and a small lane of image nodes: an **ImportImage** source, an
**ExportImage** sink, and a handful of operations — **ResizeImage**, **ConvertImageFormat**,
**FlipImage**, **CompositeImage** — that lean on Babylon's existing image utilities (`DumpTools`,
`ScreenshotTools`, `Tools`) plus the browser canvas rather than a new image library. Because a pure
image pipeline has no SCENE terminal, generalise `buildAsync()` to pull from whatever terminal export
block it finds (SCENE or IMAGE), removing the milestone-1 assumption that the sink is always the glTF
export block.

## User Stories

1. As a pipeline author, I want to import a PNG/JPEG/WebP as an IMAGE source node, so that I can start
   a 2D pipeline.
2. As a pipeline author, I want to export an IMAGE as deliverable bytes, so that my image pipeline
   produces a real file I can ship.
3. As a pipeline author, I want a ResizeImage node with target width/height, so that I can produce
   correctly sized assets.
4. As a pipeline author, I want a ConvertImageFormat node (PNG ↔ JPEG ↔ WebP), so that I can optimise
   delivery format.
5. As a pipeline author, I want a FlipImage node, so that I can correct orientation/UV conventions.
6. As a pipeline author, I want a CompositeImage node that overlays one image on another at a
   position, so that I can stamp a watermark, badge, or logo.
7. As a pipeline author, I want image operation parameters (dimensions, quality, format, offset) in
   the properties pane, so that I can tune them visually.
8. As a pipeline author, I want to chain image operations, so that I can build a real 2D pipeline
   (import → resize → composite → convert → export).
9. As a pipeline author, I want the IMAGE nodes grouped in the palette, so that the 2D lane is easy to
   find.
10. As a pipeline author, I want a build that ends in an image export to work exactly like one that
    ends in a glTF export, so that the tool feels consistent across payload types.
11. As a pipeline author, I want a clear preview or reported result of the produced image, so that I
    can see what my 2D pipeline made.

## Implementation Decisions

- **IMAGE payload shape.** `{ data: Uint8Array; mimeType: string; width?: number; height?: number }`
  — encoded bytes at the boundary (import/export), decoded to pixels inside ops that need them
  (canvas / `ImageBitmap`), then re-encoded. Mirrors the model-in-the-middle / bytes-at-boundaries
  approach the SCENE lane uses.
- **ImportImageBlock / ExportImageBlock.** Source turns source bytes into an IMAGE; sink turns an
  IMAGE into deliverable bytes. `ExportImageBlock` is a terminal export block parallel to
  `ExportGLTFBlock`.
- **Generalised terminal.** Change `buildAsync()` to locate the terminal export block generically
  (a block with no connected outputs / an "is export" marker) rather than hard-coding
  `ExportGLTFBlock`. This is the minimal, contained relaxation of the milestone-1 single-sink
  assumption; multi-sink graphs remain out of scope.
- **Operations lean on Babylon utils + canvas.** `ResizeImage` and `CompositeImage` use a 2D canvas
  (`drawImage`); `ConvertImageFormat` re-encodes via the same canvas/`DumpTools` path Babylon already
  uses to turn pixel data into PNG/JPEG; `FlipImage` is a canvas transform. We reuse
  `DumpTools` / `ScreenshotTools` / `Tools` for encoding rather than adding an image codec dependency.
- **Parameters** surface through the existing property descriptors (text/slider/dropdown).
- **No preview-capture node.** Capturing the live 3D preview as an image (the dropped
  `RenderThumbnail`) is explicitly not built; the image utilities are used as libraries, not to read
  the editor's canvas.

## Testing Decisions

- **Reuse `buildAsync()` as the seam**, now able to terminate at an image export. A good test builds
  ImportImage → op(s) → ExportImage and asserts on the *output image* (dimensions, mimeType, and for
  simple cases pixel spot-checks), never on op internals.
- **Per-op behavioural tests:** ResizeImage changes dimensions to target; ConvertImageFormat changes
  mimeType and produces a valid decode; CompositeImage places the overlay (spot-check a pixel where
  the overlay lands). Prior art: the compression-block tests that assert on the produced artifact.
- **Canvas dependency → Playwright seam where needed.** Ops that require a real 2D canvas run in the
  existing editor Playwright (browser) seam, which has a canvas; metadata-only assertions can run at
  the headless seam. This split is deliberate and called out so the canvas requirement isn't a
  surprise.
- **Generalised-terminal regression:** a graph ending in ExportImage builds without any glTF export
  present; a graph ending in ExportGLTF still builds unchanged.

## Out of Scope

- Cross-lane wiring: pulling a texture out of a SCENE as an IMAGE, or pushing an IMAGE back in as a
  texture — that is slice 06.
- Texture-atlas packing, advanced filters (blur/sharpen/color-grade), color management, GPU/compute
  image processing.
- Multiple export sinks in one graph, or per-branch outputs.
- Capturing the live preview as an image (dropped `RenderThumbnail`).

## Further Notes

- The image lane looks orphaned until slice 06 connects it to the SCENE spine (extract a baseColor
  texture → process it → set it back). That's intentional sequencing: prove the lane works in
  isolation first, then bridge.
- Keeping the IMAGE payload as encoded-bytes-plus-metadata (not a live GPU texture) keeps it portable
  through save/load and cheap to reason about; ops pay a decode/encode cost per step, which is fine at
  POC scale.
- `preserveDrawingBuffer: true` on the preview engine remains available for future capture use cases,
  but is intentionally unused here.
