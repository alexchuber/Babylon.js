# 03 — GetProperty block (read a property at a pointer out of a SCENE)

Status: ready-for-agent

## Parent

`.scratch/03-scalar-wires-and-selectors/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**GetProperty / SetProperty**: "GetProperty reads the value at a pointer out of a SCENE (output JSON)") ·
Decision: `docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (one Selector +
GetProperty + SetProperty triad subsumes a family of property-specific nodes).

## Goal

Add the **GetProperty** block: inputs a SCENE and a STRING pointer, resolves the pointer to a property
accessor via the slice's converter (issue 02), and outputs `accessor.get()` as a **JSON** value. It lets
a pipeline extract any mapped property — a material factor, a node transform, an `extras` value — to feed
elsewhere, without a bespoke per-property node.

## KISS ground rules (read first)

- **Model on `dracoCompressionBlock.ts`** — extend `NodeAssetBlock`; register a `SCENE` input, a `STRING`
  input (pointer), and a `JSON` output; do the work in `_buildBlockAsync`. It **reads**, so it does not
  mutate or output the SCENE.
- **Delegate all resolution to the converter (issue 02).** GetProperty owns no pointer logic of its own —
  it resolves an accessor and returns `accessor.get()`. Do not duplicate the mapping table.
- **Value currency is JSON.** Output whatever `get()` returns as a JSON payload (glTF property values are
  naturally JSON-serialisable). No per-pointer typing of the output (PRD out-of-scope).
- **Fail loudly on a bad pointer** — let the converter's clear error surface (do not swallow it).

## What to build

- **`GetProperty`** — `SCENE` input, `STRING` pointer input, `JSON` output. `_buildBlockAsync` reads the
  input `Document`, resolves the pointer via the converter, and sets `output.value = accessor.get()`.
  Sketch:

  ```ts
  // src/Blocks/getProperty.ts
  export class GetProperty extends NodeAssetBlock {
      public static override ClassName = "GetProperty";
      public readonly scene: NodeAssetConnectionPoint;   // SCENE
      public readonly pointer: NodeAssetConnectionPoint; // STRING
      public readonly output: NodeAssetConnectionPoint;  // JSON
      // _buildBlockAsync:
      //   const document = this.scene.value as Document;   // throw if missing
      //   const accessor = ResolvePointer(document, this.pointer.value as string);
      //   this.output.value = accessor.get();
  }
  ```

- **Editor exposure** — under the **Selectors** palette category (alongside Selector and SetProperty);
  self-register the descriptor. Its pointer input is normally fed by a Selector (issue 01) or a
  `StringLiteral` (issue 00).
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam. Because GetProperty outputs JSON (there is no scalar sink
yet), observe the read **through the existing SCENE seam** by routing the value back into the `Document`
via a SetProperty into `extras`, then exporting and re-parsing (get → set → export):

- **Read-through-extras** — ImportGLTF → GetProperty(`/materials/0/emissiveFactor`) →
  SetProperty(`/materials/0/extras/copiedEmissive`, value) → ExportGLTF; re-parse and assert
  `materials[0].extras.copiedEmissive` equals the original emissive factor. (Uses issue 04; if 04 is not
  yet landed, assert `output.value` directly off the block as an interim check and add the seam test when
  04 lands.)
- **Round-trip a node transform** — the same get → set → export shape for `/nodes/0/translation`, proving
  the read generalises beyond materials.
- **Bad pointer** — a GetProperty with an out-of-range or unknown pointer fails the build with the
  converter's clear error.

## Acceptance criteria

- [ ] `GetProperty` exists in `src/Blocks/`, with `SCENE` + `STRING` inputs and a `JSON` output, modeled
      on `DracoCompressionBlock`; it does not mutate or output the SCENE.
- [ ] It resolves the pointer via the issue-02 converter and outputs `accessor.get()` as JSON; it owns no
      pointer/mapping logic of its own.
- [ ] The block self-registers, is exported from `src/index.ts`, and appears under the **Selectors**
      palette category.
- [ ] A headless `buildAsync()` test observes a read through the SCENE seam (get → set-into-extras →
      export → re-parse) for a material factor and a node transform; a bad pointer fails with a clear
      error. They pass.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 02 (pointer→accessor converter)** — GetProperty calls it to resolve the pointer. **Hard block.**
- **Issue 00 (scalar wire kinds + literals)** — needs the STRING / JSON kinds and uses a
  `StringLiteral` / Selector to feed the pointer in tests. **Hard block** for the kinds.
- **Benefits from** issue 04 (SetProperty) to observe the read through the SCENE seam, and issue 01
  (Selector) as a pointer source — **not** hard blocks (an interim direct `output.value` assertion works
  until 04 lands).
