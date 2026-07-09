# 00 — Converter texture-slot IMAGE accessor (read + replace a Texture's image payload)

Status: ready-for-agent

## Parent

`.scratch/06-extract-and-recompose/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**property accessor**: "the `get` / `getTarget` / `set` / `type` handle a pointer resolves to, produced by
NAE's own path→accessor converter over the gltf-transform `Document`"; **ExtractTexture / SetTexture**:
"Same converter as GetProperty/SetProperty, different port kind") · Decision:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` ("One Selector + GetProperty +
SetProperty triad subsumes set-extras (03), place/transform (05), and **extract-texture (06)**").

## Goal

Extend the slice-03 path→accessor converter so a **texture-slot pointer** (e.g.
`/materials/2/pbrMetallicRoughness/baseColorTexture`) resolves to an accessor that can **read the
referenced texture's image payload** (encoded bytes + `mimeType`) and **write/replace it**. This is the
single shared code path both ExtractTexture (issue 01) and SetTexture (issue 02) call — extract does the
read, set does the replace. It is the one genuinely new piece of logic in this slice; the two blocks on
top of it are thin and symmetric. No new pointer grammar.

## Why this is its own slice

Slice 03 already made texture-slot pointers **resolve to the texture property**; this issue teaches that
resolved accessor to speak in **IMAGE payloads** (bytes + `mimeType`) rather than a JSON reference. It is
pure `Document` logic with no block, port, or editor surface, verifiable entirely through focused
get-then-set unit tests — exactly the "make the change easy, then make the easy change" foundation that
slice-03's converter issue was for GetProperty/SetProperty. Landing it first lets issues 01 and 02 be thin
parallel blocks that just call it.

## KISS ground rules (read first)

- **Extend, do not fork.** Add texture-image get/replace to the **existing** slice-03 converter
  (`src/selector/pointerToAccessor.ts` or wherever slice-03 landed it). Do **not** create a second,
  parallel converter or a "texture converter" abstraction — one converter, one mapping table (ADR 0003).
- **IMAGE payload is the currency.** The get returns the slice-04 IMAGE payload shape
  `{ data: Uint8Array; mimeType: string; width?; height? }`; the set consumes the same shape. Reuse the
  shared payload type from slice-04's `src/Blocks/imagePayload.ts` — do **not** redefine it.
- **No new pointer grammar.** Texture slots are already addressable via the slice-03 mapping table
  (baseColor, normal, metallicRoughness, emissive, occlusion). This issue only changes what the accessor
  *does at* a texture slot, not how the slot is named.
- **gltf-transform is the only image I/O.** Read/replace go through gltf-transform's `Texture`
  (`texture.getImage()` / `getMimeType()` / `setImage()` / `setMimeType()`); create the `Texture` on
  replace when the slot is empty. Keep the dynamic-`import` / block-body convention where imports are
  needed. Do **not** decode pixels here — this is bytes-at-boundary (a slot swap), no canvas.
- **Fail loudly.** An empty slot on *read* and an out-of-range material index throw a clear error naming
  the offending pointer (the same error style the slice-03 converter already uses).

## What to build

- **A texture-image accessor path** in the existing converter: when a pointer resolves to a material
  **texture slot**, expose (in addition to / alongside the slice-03 texture-property accessor) an accessor
  that:
  - **reads** the slot's `Texture` and returns `{ data: texture.getImage(), mimeType:
    texture.getMimeType(), width?, height? }` as an IMAGE payload (throw if the slot is empty);
  - **replaces** the slot's `Texture` image from an IMAGE payload (`setImage(data)` + `setMimeType(...)`),
    **creating** the `Texture` and wiring it into the slot if none exists, leaving the rest of the material
    untouched.

  Sketch (shape, not prescription):

  ```ts
  // extends the slice-03 mapping for material texture slots
  // GET:  const tex = material.getBaseColorTexture();
  //       if (!tex) throw new Error(`No texture at "${pointer}"`);
  //       return { data: tex.getImage()!, mimeType: tex.getMimeType() };
  // SET:  let tex = material.getBaseColorTexture();
  //       if (!tex) { tex = document.createTexture(); material.setBaseColorTexture(tex); }
  //       tex.setImage(payload.data); tex.setMimeType(payload.mimeType);
  ```

- **Keep the JSON-typed texture accessor intact.** GetProperty/SetProperty must still resolve the same
  slot to its JSON reference as before; this issue **adds** the IMAGE-typed behavior, it does not replace
  the JSON one. The two are "the IMAGE-typed vs JSON-typed members of the selector family" (glossary).
- **Report `type`** for the texture-image accessor as IMAGE so the blocks can rely on it.

## Tests

This module is pure `Document` logic, so it is verified by **focused unit tests** (the block-level
`buildAsync()` seam is exercised by issues 01/02), mirroring slice-03's converter unit tests:

- **Read a texture's image** — build a small in-code `Document` with a material whose baseColor slot has a
  known image; resolve the slot pointer; assert the accessor returns the exact bytes + `mimeType`.
- **Replace a texture's image** — resolve the same slot; write a new IMAGE payload; assert a fresh read
  returns the new bytes + `mimeType`, and the material's other properties (factors, other slots) are
  unchanged.
- **Create-on-empty** — resolve an **empty** slot; write an IMAGE payload; assert a `Texture` is created,
  wired into the slot, and reads back the written payload.
- **Empty-slot read + bad pointer** — reading an empty slot throws a clear error; an out-of-range material
  index / unknown slot throws the slice-03 converter's clear pointer-naming error.
- **JSON accessor unaffected** — the existing GetProperty/SetProperty JSON resolution of the same slot
  still works (regression for "add, don't replace").

## Acceptance criteria

- [ ] The **existing** slice-03 converter is extended so a material texture-slot pointer yields an accessor
      that reads the referenced texture's image as a slice-04 IMAGE payload (`{ data, mimeType, … }`) and
      replaces it (creating the `Texture` when the slot is empty).
- [ ] Only gltf-transform `Texture` APIs are used for image I/O; **no** pixel decode / canvas; the shared
      IMAGE payload type from slice-04 is reused (not redefined).
- [ ] No second converter, no "texture converter" abstraction, and no new pointer grammar are introduced —
      one converter, one mapping table (ADR 0003).
- [ ] The JSON-typed texture accessor used by GetProperty/SetProperty is **unchanged**; the IMAGE behavior
      is additive.
- [ ] Reading an empty slot and an out-of-range/unknown pointer throw clear pointer-naming errors.
- [ ] Focused unit tests cover read, replace, create-on-empty, empty-slot/bad-pointer errors, and the JSON
      regression; they pass. `lint:check` + `format:check` pass.

## Blocked by

- **slice-03 issue 02 — `02-pointer-to-accessor-converter.md`** (the base path→accessor converter and its
  material texture-slot resolution). **Hard block** — this issue extends that module. *(Currently on branch
  `alexchuber-issueify-slice-03-scalar-wires`, not yet on dev; reference by intent.)*
- **slice-04 issue 00 — `00-image-lane-foundation.md`** for the shared IMAGE payload TS type. **Hard
  block** for the payload shape. *(Currently on branch `alexchuber-issue-ify-slice-04`, not yet on dev.)*
- Assumes **slice 02** (SCENE spine + self-registration) has landed.

## Note for whoever merges

This is the foundation for issues 01 (ExtractTexture) and 02 (SetTexture) — both are thin blocks that call
this accessor. It touches only the slice-03 converter module + its unit tests; expect no overlap with the
block files added by 01/02.
