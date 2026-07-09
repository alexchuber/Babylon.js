# 02 — SetTexture block (IMAGE-typed Set: write a texture back into a SCENE)

Status: ready-for-agent

## Parent

`.scratch/06-extract-and-recompose/PRD.md` (user stories 3, 4, 10) · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**ExtractTexture / SetTexture**: "SetTexture writes an IMAGE into a
texture slot. Same converter as GetProperty/SetProperty, different port kind") · Decisions:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (typed member of the one selector
mechanism) · `docs/adr/0001-scene-spine-is-gltf-transform-document.md` (the write lands in the SCENE
`Document`).

## Goal

Add the **SetTexture** block: inputs a SCENE, a STRING pointer naming a material texture slot, and an
IMAGE, resolves the pointer via the converter's texture-image accessor (issue 00), writes the IMAGE into
that slot (creating the `Texture` if needed), and outputs the (in-place-mutated) SCENE. It is the
IMAGE-typed sibling of SetProperty — same pointer, same converter, different terminating port kind — so a
reprocessed texture can be put *back* on the model. Together with ExtractTexture it closes the extract →
process → set round-trip.

## Why this is its own slice

It is the thin write-side block over the issue-00 accessor — the exact analog of slice-03's SetProperty
over the converter, and the symmetric partner to ExtractTexture (issue 01). Splitting it keeps each block a
small PR. It also **owns the headline round-trip test** (extract → resize → set) because that test is what
proves the pair, and it needs both blocks present.

## KISS ground rules (read first)

- **Model on `setProperty.ts`** (slice-03) — a `SCENE` in → `SCENE` out middle block, plus a `STRING`
  pointer input and an **`IMAGE`** value input; work in `_buildBlockAsync`.
- **Delegate resolution to the converter (issue 00).** SetTexture owns no pointer logic — resolve the
  texture-image accessor and call `accessor.set(imagePayload)`. Do **not** duplicate the mapping table or
  touch gltf-transform `Texture` directly.
- **In-place mutation is retained** (as in slices 02–03): mutate the incoming `Document` and pass the
  **same reference** through. Do **not** clone here — DAG/fan-out correctness is slice 05's job (see
  Blocked by).
- **Not a bespoke node.** Typed specialization of the selector, driven by the pointer (ADR 0003) — no
  per-slot `SetTextureX` family.
- **Fail loudly** — an out-of-range material index / unknown slot surfaces the converter's clear error.

## What to build

- **`SetTexture`** — `SCENE` input, `STRING` pointer input, `IMAGE` value input, `SCENE` output.
  `_buildBlockAsync` reads the input `Document`, resolves the pointer via the issue-00 accessor, calls
  `accessor.set(this.image.value)`, and sets `output.value` to the same `Document`. Sketch:

  ```ts
  // src/Blocks/setTexture.ts
  export class SetTexture extends NodeAssetBlock {
      public static override ClassName = "SetTexture";
      public readonly scene: NodeAssetConnectionPoint;   // SCENE
      public readonly pointer: NodeAssetConnectionPoint; // STRING
      public readonly image: NodeAssetConnectionPoint;   // IMAGE  { data, mimeType, width?, height? }
      public readonly output: NodeAssetConnectionPoint;  // SCENE
      // _buildBlockAsync:
      //   const document = this.scene.value as Document;             // throw if missing
      //   const accessor = ResolvePointer(document, this.pointer.value as string);
      //   accessor.set(this.image.value);                            // replace or create the Texture
      //   this.output.value = document;                              // same reference, mutated in place
  }
  ```

- **Editor exposure** — under the **Selectors** palette category; self-register the descriptor (or add to
  the catalog by hand if slice-01 self-registration has not landed). The pointer is normally fed by a
  Selector / `StringLiteral`; the IMAGE value by an ExtractTexture → image-op chain or an ImportImage.
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam — build, export, re-parse the output `Document`, assert the
texture changed and the rest of the material did not (never reach into block internals):

- **Texture round-trip (headline, PRD Testing Decisions)** — ImportGLTF(a textured fixture) →
  ExtractTexture(baseColor) → ResizeImage(slice-04) → SetTexture(baseColor) → ExportGLTF; re-parse and
  assert the output's baseColor texture has the **new dimensions** and the rest of the material (factors,
  other slots) is **unchanged**. *(Canvas-dependent resize runs at the Playwright seam per slice 04; the
  headless assertion checks the exported texture's declared size / that the swap happened.)*
- **Set from ImportImage** — ImportGLTF(bare or textured) → SetTexture(baseColor, ImportImage bytes) →
  ExportGLTF; re-parse and assert the slot now references a texture carrying the imported image, other
  slots untouched.
- **Create-on-empty** — SetTexture into a material whose slot is empty creates the texture and the exported
  material references it.
- **Passes the SCENE through** — the output is a valid SCENE that still exports and can be chained (e.g. a
  second SetTexture or an operator after it).
- **Bad pointer** — an out-of-range/unknown slot fails the build with the converter's clear error.

## Acceptance criteria

- [ ] `SetTexture` exists in `src/Blocks/`, with `SCENE` + `STRING` + **`IMAGE`** inputs and a `SCENE`
      output, modeled on `SetProperty`.
- [ ] It resolves the pointer via the issue-00 texture-image accessor and writes the IMAGE (replacing or
      creating the `Texture`), then outputs the same in-place-mutated `Document`; it owns no pointer/mapping
      logic and does not touch gltf-transform `Texture` directly.
- [ ] In-place mutation is retained; **no** cloning / copy-on-fan-out is attempted here (deferred to slice
      05).
- [ ] The block self-registers, is exported from `src/index.ts`, and appears under the **Selectors** palette
      category with an `IMAGE` value input port.
- [ ] Headless `buildAsync()` tests assert, through export + re-parse: the extract→resize→set round-trip
      (new texture dimensions, rest of material unchanged), set-from-ImportImage, create-on-empty,
      chain-through, and a bad-pointer error. They pass (canvas-dependent image steps at the Playwright
      seam per slice 04).
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (converter texture-image accessor)** — SetTexture calls it to write the texture image. **Hard
  block.**
- **slice-04 issue 00 — `00-image-lane-foundation.md`** for the `IMAGE` kind + payload type (and
  `ImportImageBlock` used in tests). **Hard block.** *(On branch `alexchuber-issue-ify-slice-04`.)*
- **The round-trip test additionally needs:** **issue 01 (ExtractTexture)** and **slice-04 issue 01**
  (`01-single-input-image-operations.md`, `ResizeImage`). SetTexture's own core (set-from-ImportImage,
  create-on-empty) does **not** need issue 01 — deliver those first if 01 lags.
- **slice 05 (evaluate-once + copy-on-fan-out)** — the extract → process → set round-trip fans the imported
  SCENE out to *both* the ExtractTexture read branch and the SetTexture write branch (a diamond). Correct
  results in that topology rely on slice 05's copy-on-fan-out; the PRD explicitly makes this slice depend on
  05. **Hard block for the round-trip test's correctness.** *(slice-05 PRD on branch
  `alexchuber-issueify-slice-05-scene-composition`; issues not yet filed — reference by intent.)*
- Assumes **slice 02** has landed.

## Note for later slices

SetTexture and SetProperty share the converter's set path; if a future slice adds occlusion/other slots to
the mapping table, both benefit with no block change.
