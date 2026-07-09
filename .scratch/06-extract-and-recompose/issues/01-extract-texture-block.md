# 01 — ExtractTexture block (IMAGE-typed Get: read a texture slot out of a SCENE)

Status: ready-for-agent

## Parent

`.scratch/06-extract-and-recompose/PRD.md` (user stories 1, 2, 4) · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**ExtractTexture / SetTexture**: "ExtractTexture resolves a
texture-slot pointer and outputs the texture as an IMAGE … Same converter as GetProperty/SetProperty,
different port kind") · Decision:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (the selector triad subsumes
**extract-texture (06)**; IMAGE vs JSON is just which port kind it terminates in).

## Goal

Add the **ExtractTexture** block: inputs a SCENE and a STRING pointer naming a material texture slot,
resolves it via the converter's texture-image accessor (issue 00), and outputs the referenced texture's
**image bytes + `mimeType` as an IMAGE**. It is the IMAGE-typed sibling of GetProperty — same pointer, same
converter, different terminating port kind — so a pipeline can pull a texture *out* of a model and feed it
into the 2D image lane.

## Why this is its own slice

It is a thin block over the issue-00 accessor — the exact analog of slice-03's GetProperty over the
slice-03 converter. Splitting it from SetTexture (issue 02) keeps each block a small, symmetric PR and lets
extract land and be exercised (via the 2D lane) before the write side. It carries no pointer/mapping logic
of its own.

## KISS ground rules (read first)

- **Model on `getProperty.ts`** (slice-03) — extend `NodeAssetBlock`; register a `SCENE` input, a `STRING`
  pointer input, and an **`IMAGE`** output; do the work in `_buildBlockAsync`. It **reads**, so it does
  **not** mutate or output the SCENE.
- **Delegate all resolution to the converter (issue 00).** ExtractTexture owns no pointer logic — it
  resolves the texture-image accessor and returns `accessor.get()` (an IMAGE payload). Do **not** duplicate
  the mapping table or touch gltf-transform's `Texture` directly.
- **Not a new bespoke node.** This is a **typed specialization of the selector**, not an `ExtractTextureX`
  family — the whole point of ADR 0003. One block, driven by the pointer.
- **Fail loudly** — an empty slot or bad pointer surfaces the converter's clear error (do not swallow it).

## What to build

- **`ExtractTexture`** — `SCENE` input, `STRING` pointer input, `IMAGE` output. `_buildBlockAsync` reads the
  input `Document`, resolves the pointer via the issue-00 accessor, and sets `output.value` to the IMAGE
  payload. Sketch:

  ```ts
  // src/Blocks/extractTexture.ts
  export class ExtractTexture extends NodeAssetBlock {
      public static override ClassName = "ExtractTexture";
      public readonly scene: NodeAssetConnectionPoint;   // SCENE
      public readonly pointer: NodeAssetConnectionPoint; // STRING (e.g. /materials/2/pbrMetallicRoughness/baseColorTexture)
      public readonly output: NodeAssetConnectionPoint;  // IMAGE
      // _buildBlockAsync:
      //   const document = this.scene.value as Document;             // throw if missing
      //   const accessor = ResolvePointer(document, this.pointer.value as string);
      //   this.output.value = accessor.get();                        // { data, mimeType, width?, height? }
  }
  ```

- **Editor exposure** — under the **Selectors** palette category (alongside Selector / GetProperty /
  SetProperty), self-registering its descriptor if slice-01 self-registration is in place, otherwise added
  to the existing catalog by hand. Its pointer input is normally fed by a Selector or a `StringLiteral`.
  The output is an `IMAGE` port (reuse slice-04's `ImagePortColor`).
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam. Because the output is an IMAGE (a scalar-ish payload), assert
the extracted bytes directly at the block output and/or route through **ExportImage** (slice-04) to observe
it through the terminal:

- **Extract to ExportImage** — ImportGLTF(a fixture with a known baseColor texture) →
  ExtractTexture(`/materials/0/pbrMetallicRoughness/baseColorTexture`) → ExportImage; `buildAsync()`
  returns the texture's **exact bytes** and preserves its `mimeType`. (Interim, until wired: assert
  `output.value.data` / `.mimeType` off the block directly.)
- **Feeds the 2D lane** — ImportGLTF → ExtractTexture → ResizeImage (slice-04) → ExportImage builds, and
  the exported image has the **resized** dimensions — proving the extracted texture is a first-class IMAGE
  the image operations accept. *(Any pixel/canvas assertion runs at the Playwright seam per slice 04; the
  metadata-only dimension/mimeType assertions run headless.)*
- **Read-only** — the SCENE is not mutated by extraction: an ImportGLTF → ExtractTexture branch alongside a
  plain ExportGLTF of the same import produces an **unchanged** glTF.
- **Bad pointer / empty slot** — extracting from an empty or out-of-range slot fails the build with the
  converter's clear error.

## Acceptance criteria

- [ ] `ExtractTexture` exists in `src/Blocks/`, with `SCENE` + `STRING` inputs and an **`IMAGE`** output,
      modeled on `GetProperty`; it does **not** mutate or output the SCENE.
- [ ] It resolves the pointer via the issue-00 texture-image accessor and outputs the IMAGE payload; it
      owns no pointer/mapping logic and does not touch gltf-transform `Texture` directly.
- [ ] It is a typed specialization of the selector (no bespoke per-slot node family); the block
      self-registers, is exported from `src/index.ts`, and appears under the **Selectors** palette category
      with an `IMAGE` output port.
- [ ] Headless `buildAsync()` tests cover extract→ExportImage (exact bytes + mimeType), extract→resize
      (dimension change through the 2D lane, canvas steps at the Playwright seam), read-only-on-the-SCENE,
      and a bad-pointer/empty-slot error. They pass.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (converter texture-image accessor)** — ExtractTexture calls it to read the texture image.
  **Hard block.**
- **slice-04 issue 00 — `00-image-lane-foundation.md`** for the `IMAGE` kind, the IMAGE payload type, and
  `ExportImageBlock` (used in the tests). **Hard block.** *(On branch `alexchuber-issue-ify-slice-04`, not
  yet on dev; reference by intent.)*
- **Benefits from** slice-04 issue 01 (`01-single-input-image-operations.md`, `ResizeImage`) for the
  feeds-the-2D-lane test, and **benefits from** slice-01 self-registration for palette exposure — **not**
  hard blocks (append to the catalog by hand and assert `output.value` directly in the interim).
- Assumes **slice 02** has landed.
