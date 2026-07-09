# 01 — Single-input image operations: ResizeImage, ConvertImageFormat, FlipImage

Status: ready-for-agent

## Parent

`.scratch/04-image-pipeline/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**connection point type** `IMAGE`; the image lane's middle blocks) · Decision:
`docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (block bodies interpret the opaque `value`;
repetition inside block bodies is cheaper than a wrong abstraction).

## Goal

Grow the image lane's middle with three **`IMAGE → IMAGE` operation blocks**: **ResizeImage** (target
width/height), **ConvertImageFormat** (PNG ↔ JPEG ↔ WebP + quality), and **FlipImage** (horizontal /
vertical). Each **decodes** the IMAGE payload's bytes onto a 2D canvas, performs its operation,
**re-encodes** to a new IMAGE payload, leaning on Babylon's existing image utilities
(`DumpTools` / `ScreenshotTools` / `Tools`) plus the **browser canvas** — no new image codec. After it,
a real 2D chain (`import → resize → convert → export`) builds, and each op's params surface in the
properties pane.

## Why this is its own slice (and how it batches)

These three ops share **one** decode → canvas → encode path, so they belong together; a tiny shared
**local helper** for that path is fine, but **not** an image-op base class or framework (ADR 0002).
**One block per operation** — each is independently testable and landable, so this may be delivered in
**per-op batches**. It is independent of slice 03 and of the SCENE lane.

## Canvas seam (read first)

These ops need a **real 2D canvas** (`drawImage`, `toBlob`/`convertToBlob`, `createImageBitmap`), which
the headless unit seam does not have. Per the PRD's Testing Decisions:

- **Pixel / canvas assertions run in the editor Playwright (browser) seam**, which has a canvas.
- **Metadata-only assertions** (output `mimeType`, output `width`/`height` read from the payload) can
  run at the headless `buildAsync()` seam.

This split is deliberate — call it out so the canvas requirement is not a surprise. The **decode/encode
helper** this issue introduces is the single place that touches the canvas, so it is the natural seam to
exercise (or stub) per test tier.

## KISS ground rules (read first)

- **One block per op**, each modeled on `dracoCompressionBlock.ts`: one `IMAGE` input + one `IMAGE`
  output, work in `_buildBlockAsync`, **dynamic-`import`** any Babylon util inside the body.
- **A single shared local helper** — "IMAGE payload → canvas/`ImageBitmap`" and "canvas → IMAGE payload
  (bytes + mimeType + width/height)" — is allowed and encouraged (this is genuine shared plumbing, not a
  premature abstraction). Put it beside the blocks (e.g. `src/Blocks/imageCanvas.ts`). **Do not** build
  an operator base class or a generic "apply any canvas op" block.
- **Reuse `DumpTools` / `ScreenshotTools` / `Tools`** for encoding pixel data to PNG/JPEG/WebP rather
  than adding an image-codec dependency (PRD).
- **Surface only the params that matter**: Resize `width`/`height` (and optionally a keep-aspect
  toggle); Convert `format` + `quality`; Flip `axis` (horizontal/vertical). Sensible defaults for the
  rest.
- **No fan-out cloning.** Each op emits fresh bytes, so in-place concerns don't apply; DAG fan-out
  correctness is slice 05 — do not attempt it here.

## What to build

- **`ResizeImage`** — `width`/`height` (px) props; `drawImage` the decoded source into a
  target-sized canvas; re-encode preserving the input `mimeType`. Sketch:

  ```ts
  // src/Blocks/resizeImageBlock.ts (one file per op, modeled on DracoCompressionBlock)
  export class ResizeImageBlock extends NodeAssetBlock {
      public static override ClassName = "ResizeImageBlock";
      public width = 256;
      public height = 256;
      public readonly input: NodeAssetConnectionPoint;  // IMAGE
      public readonly output: NodeAssetConnectionPoint; // IMAGE
      // _buildBlockAsync: payload = input.value; bitmap = await decode(payload);
      //   draw bitmap into a width×height canvas; output.value = await encode(canvas, payload.mimeType);
  }
  ```

- **`ConvertImageFormat`** — `format` (`png` / `jpeg` / `webp`) + `quality` (0–1, for lossy formats)
  props; decode then re-encode to the new `mimeType`; output payload carries the new `mimeType`.
- **`FlipImage`** — `axis` (horizontal / vertical) prop; a canvas transform (`scale(-1, 1)` /
  `scale(1, -1)`) before `drawImage`; re-encode preserving `mimeType`.
- **Editor exposure** — descriptors under the **Image** palette category (introduced in issue 00); each
  op's params surface as property lines via `buildPropertySections` (dropdown for format/axis, sliders
  for dimensions/quality), the **same seam Draco/KTX2 use**. Self-register the descriptors.
- Export each block from `src/index.ts`; add each descriptor module to the `blockDescriptors/index.ts`
  barrel.

## Tests

Headless `buildAsync()` for metadata; the editor Playwright (browser) seam for pixels. Build
`ImportImage → op(s) → ExportImage` over a small fixture image and assert on the **output image**, never
on op internals (prior art: the compression-block tests asserting on the produced artifact):

- **ResizeImage** → output `width`/`height` equal the target (metadata assertion; headless-friendly if
  the encoder path is available, else Playwright).
- **ConvertImageFormat** → output `mimeType` changed **and** the bytes decode to a valid image.
- **FlipImage** → a corner-pixel spot-check confirms the image is mirrored on the chosen axis
  (Playwright seam).
- **Chain** — `Import → Resize → Convert → Export` builds and the output has the resized dimensions +
  converted `mimeType`.
- The metadata-vs-pixel **seam split** above is applied explicitly (metadata headless, pixels
  Playwright).

## Acceptance criteria

- [ ] `ResizeImageBlock`, `ConvertImageFormatBlock`, and `FlipImageBlock` exist in `src/Blocks/`, each
      `IMAGE → IMAGE`, modeled on `DracoCompressionBlock`, doing the work in `_buildBlockAsync`.
- [ ] A single shared **decode/encode canvas helper** backs all three; **no** op base class or generic
      apply-any-canvas-op block is introduced; encoding reuses `DumpTools`/`ScreenshotTools`/`Tools`
      (no new image-codec dependency).
- [ ] Each op exposes only its key params (Resize w/h, Convert format+quality, Flip axis) as public
      serialized properties and as editor property lines; blocks appear under the **Image** palette
      category and are exported from `src/index.ts`.
- [ ] Tests assert each op's effect on the **output image** (Resize → dimensions, Convert → mimeType +
      valid decode, Flip → mirrored pixel) and that a `Import → Resize → Convert → Export` chain builds;
      metadata runs headless, pixel checks run in the Playwright seam.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (IMAGE lane foundation)** — needs the `IMAGE` kind and Import/Export so each op is
  build/test-able through `buildAsync()`.
- **May be delivered as per-op batches** (e.g. Resize first, then Convert + Flip); each block is
  independently landable. The first op to land introduces the shared canvas helper.
