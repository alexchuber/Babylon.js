# 02 — CompositeImage: overlay one IMAGE on another

Status: ready-for-agent

## Parent

`.scratch/04-image-pipeline/PRD.md` (user story 6 — watermark / badge / logo) · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**connection point type** `IMAGE`; the image lane's middle
blocks) · Decision: `docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (block bodies interpret
the opaque `value`; repetition over premature abstraction).

## Goal

Add the image lane's **multi-input** operation: **CompositeImage** takes a **base** IMAGE and an
**overlay** IMAGE plus an `(x, y)` offset, stamps the overlay onto the base via a 2D canvas, and outputs
the composited IMAGE. This lets an author stamp a watermark, badge, or logo onto a texture, and enables
richer 2D chains.

## Why this is its own slice

It is the **only two-input image op** — a different port shape (two `IMAGE` inputs) and a different test
(spot-check a pixel where the overlay lands vs. where it doesn't). It builds directly on the shared
decode → canvas → encode helper from issue 01, so keeping it separate keeps issue 01 about the
single-input ops and this one about the composition case. Independent of slice 03 and the SCENE lane.

## Canvas seam (read first)

Same as issue 01: compositing needs a **real 2D canvas** (`drawImage` of both layers), so **pixel
assertions run in the editor Playwright (browser) seam**; **metadata-only assertions** (output
`mimeType`, output dimensions) can run headless. Call this out so the canvas requirement is not a
surprise.

## KISS ground rules (read first)

- Modeled on the single-input ops but with **two `IMAGE` inputs** (`base`, `overlay`) and one `IMAGE`
  output; work in `_buildBlockAsync`.
- **Reuse the shared decode/encode canvas helper from issue 01.** If issue 01 has not landed, introduce
  the helper here; whoever lands second **dedupes** it (repetition over premature abstraction, ADR 0002).
- **Keep the blend trivial**: draw the base, then `drawImage` the overlay at the offset (source-over).
  **No** blend modes, opacity curves, or scaling of the overlay beyond what `drawImage` gives — out of
  scope for the POC (PRD: advanced filters/compositing are not built).
- **Params**: overlay `offsetX` / `offsetY` (px). Output dimensions follow the **base** image; the
  output `mimeType` follows the base.
- No fan-out cloning (slice 05).

## What to build

- **`CompositeImage`** — `base` + `overlay` `IMAGE` inputs, `offsetX` / `offsetY` (px) props; decode
  both payloads, draw the base into a base-sized canvas, draw the overlay at `(offsetX, offsetY)`,
  re-encode preserving the base `mimeType`. Sketch:

  ```ts
  // src/Blocks/compositeImageBlock.ts
  export class CompositeImageBlock extends NodeAssetBlock {
      public static override ClassName = "CompositeImageBlock";
      public offsetX = 0;
      public offsetY = 0;
      public readonly base: NodeAssetConnectionPoint;    // IMAGE
      public readonly overlay: NodeAssetConnectionPoint; // IMAGE
      public readonly output: NodeAssetConnectionPoint;  // IMAGE
      // _buildBlockAsync: decode base + overlay; draw base then overlay at (offsetX, offsetY)
      //   into a base-sized canvas; output.value = await encode(canvas, base.mimeType);
  }
  ```

- **Editor exposure** — a descriptor under the **Image** palette category (from issue 00); `offsetX` /
  `offsetY` surface as property lines via `buildPropertySections` (sliders/text), the same seam
  Draco/KTX2 use. Self-register the descriptor.
- Export the block from `src/index.ts`; add its descriptor module to the `blockDescriptors/index.ts`
  barrel.

## Tests

Metadata headless, pixels in the Playwright (browser) seam. Build
`ImportImage(base) + ImportImage(overlay) → CompositeImage → ExportImage` and assert on the **output
image**, never on op internals:

- **Overlay placed** — a pixel **inside** the overlay region equals the overlay's color; a pixel
  **outside** it equals the base's color (Playwright seam, with distinctly colored solid fixtures).
- **Offset honored** — changing `offsetX` / `offsetY` moves where the overlay lands (the boundary between
  overlay-color and base-color pixels shifts accordingly).
- **Metadata** — the output dimensions match the base and the output `mimeType` matches the base.

## Acceptance criteria

- [ ] `CompositeImageBlock` exists in `src/Blocks/` with two `IMAGE` inputs (`base`, `overlay`), one
      `IMAGE` output, and `offsetX` / `offsetY` params; it draws the overlay onto the base at the offset
      via a 2D canvas and re-encodes preserving the base `mimeType`.
- [ ] It reuses the shared decode/encode canvas helper from issue 01 (or introduces it if 01 has not
      landed, to be deduped); no blend-mode/opacity/overlay-scaling features are added.
- [ ] The block self-registers under the **Image** palette category, exposes `offsetX`/`offsetY` as
      serialized properties + editor property lines, and is exported from `src/index.ts`.
- [ ] Tests assert the overlay lands at the offset (inside-pixel = overlay color, outside-pixel = base
      color) and that output dimensions/`mimeType` follow the base; pixel checks run in the Playwright
      seam, metadata headless.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (IMAGE lane foundation)** — needs the `IMAGE` kind and Import/Export.
- **Benefits from issue 01** for the shared decode/encode canvas helper — **not** a hard block: inline
  the helper here if 01 has not landed, and dedupe when the two meet.
