# 04 — SetProperty block (write a value at a pointer into a SCENE)

Status: ready-for-agent

## Parent

`.scratch/03-scalar-wires-and-selectors/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**GetProperty / SetProperty**: "SetProperty writes a value at a pointer into a SCENE (output SCENE) …
together they subsume set-extras, placement, and … texture extraction") · Decision:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (this triad subsumes the rejected
per-property `SetExtras` node).

## Goal

Add the **SetProperty** block: inputs a SCENE, a STRING pointer, and a JSON value, resolves the pointer to
a property accessor via the converter (issue 02), calls `accessor.set(value)`, and outputs the
(in-place-mutated) SCENE. One block recolours a material, repositions a node, or stamps arbitrary
`extras` — replacing the unbounded family of property-specific nodes the `SetExtras` sketch would have
multiplied.

## KISS ground rules (read first)

- **Model on `dracoCompressionBlock.ts`** — a `SCENE` in → `SCENE` out middle block, plus a `STRING`
  pointer input and a `JSON` value input; work in `_buildBlockAsync`.
- **Delegate resolution to the converter (issue 02).** SetProperty owns no pointer logic — resolve an
  accessor and call `accessor.set(value)`. Do not duplicate the mapping table.
- **In-place mutation is retained** (PRD): mutate the incoming `Document` and pass the **same reference**
  through. Fan-out safety (copy-on-fan-out) is explicitly **deferred to slice 05** — do not clone here.
- **Value currency is JSON.** The value port is `JSON`; NUMBER / STRING literals that need to feed it are
  wrapped as JSON upstream. Do not add per-pointer value typing (PRD out-of-scope).
- **Fail loudly on a bad pointer** — surface the converter's clear error.

## What to build

- **`SetProperty`** — `SCENE` input, `STRING` pointer input, `JSON` value input, `SCENE` output.
  `_buildBlockAsync` reads the input `Document`, resolves the pointer via the converter, calls
  `accessor.set(this.value.value)`, and sets `output.value` to the same `Document`. Sketch:

  ```ts
  // src/Blocks/setProperty.ts
  export class SetProperty extends NodeAssetBlock {
      public static override ClassName = "SetProperty";
      public readonly scene: NodeAssetConnectionPoint;   // SCENE
      public readonly pointer: NodeAssetConnectionPoint; // STRING
      public readonly value: NodeAssetConnectionPoint;   // JSON
      public readonly output: NodeAssetConnectionPoint;  // SCENE
      // _buildBlockAsync:
      //   const document = this.scene.value as Document;   // throw if missing
      //   const accessor = ResolvePointer(document, this.pointer.value as string);
      //   accessor.set(this.value.value);
      //   this.output.value = document;   // same reference, mutated in place
  }
  ```

- **Editor exposure** — under the **Selectors** palette category; self-register the descriptor. The
  pointer is normally fed by a Selector (issue 01), the value by a `JsonLiteral` (issue 00) or a
  GetProperty (issue 03).
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam — build, export, re-parse the output `Document`, assert the
property changed (never reach into block internals):

- **Set a material factor end-to-end** — ImportGLTF → SetProperty(`/materials/0/emissiveFactor`,
  `[1,0,0]`) → ExportGLTF; re-parse and assert material 0's emissive is red (prior art: the milestone-1
  roundtrip + Draco/KTX2 assertions in `test/unit/`).
- **Set a node transform** — the same shape for `/nodes/0/translation`, asserting the node moved.
- **Write arbitrary `extras`** — SetProperty(`/…/extras/{key}`, data) → export; assert the value shows up
  under the property's `extras` in the output (the `SetExtras` use case).
- **Passes the SCENE through** — the output is the same `Document` reference / a valid SCENE that still
  exports; an operator or another SetProperty can be chained after it.
- **Bad pointer** — an out-of-range or unknown pointer fails the build with the converter's clear error.

## Acceptance criteria

- [ ] `SetProperty` exists in `src/Blocks/`, with `SCENE` + `STRING` + `JSON` inputs and a `SCENE` output,
      modeled on `DracoCompressionBlock`.
- [ ] It resolves the pointer via the issue-02 converter and calls `accessor.set(value)`, then outputs the
      same in-place-mutated `Document`; it owns no pointer/mapping logic of its own.
- [ ] In-place mutation is retained; **no** cloning / copy-on-fan-out is attempted (deferred to slice 05).
- [ ] The value port is `JSON`; no per-pointer value typing is added.
- [ ] The block self-registers, is exported from `src/index.ts`, and appears under the **Selectors**
      palette category.
- [ ] Headless `buildAsync()` tests assert, through export + re-parse, a material-factor recolour, a
      node-transform move, an `extras` write, chain-through, and a bad-pointer error. They pass.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 02 (pointer→accessor converter)** — SetProperty calls it to resolve the pointer. **Hard block.**
- **Issue 00 (scalar wire kinds + literals)** — needs the STRING / JSON kinds and uses a `JsonLiteral`
  (value) + `StringLiteral` / Selector (pointer) in tests. **Hard block** for the kinds.
- **Benefits from** issue 01 (Selector) as a pointer source and issue 03 (GetProperty) for get → set
  composition tests — **not** hard blocks.

## Note for later slices

SetProperty on `/nodes/i/*` **is** slice 05's placement primitive, and the same accessor powers slice 06's
typed ExtractTexture / SetTexture. The in-place-mutation + fan-out caveat above is exactly what slice 05
hardens — leave that work to 05.
