# 01 — Selector node (emit a glTF Object Model pointer as a STRING)

Status: ready-for-agent

## Parent

`.scratch/03-scalar-wires-and-selectors/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**selector / pointer**: "a glTF Object Model JSON Pointer … that addresses one property in a SCENE";
**Selector**: "a block that emits a pointer (as a STRING) … the future home of wildcard/query syntax") ·
Decision: `docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (a Selector emits a
pointer; keeping the pointer on a wire is what makes Get/Set composable).

## Goal

Add the **Selector** block: it holds an editable glTF Object Model JSON Pointer string
(e.g. `/nodes/0/translation`, `/materials/2/pbrMetallicRoughness/baseColorFactor`), optionally
overridable by an upstream STRING input, validates the pointer's **shape**, and outputs it as a
**STRING**. It names the property that GetProperty (03) / SetProperty (04) later act on. After it, the
palette has a **Selectors** category and a pointer can be authored once and fanned out to reads and
writes.

## Why this is its own slice

It is a self-contained STRING→STRING (plus a literal param) block with no dependency on the converter or
the Get/Set blocks — it only needs the STRING kind from issue 00. Landing it separately lets the
pointer-authoring UX (typed field + validation + optional override) be built and tested on its own, and
gives Get/Set a natural pointer source without entangling their slices.

## KISS ground rules (read first)

- **Model on a source/middle hybrid** — like `importGLTFBlock.ts` for the "value as a serialized
  property" pattern, but it also takes one optional STRING input (the override), like a middle block. One
  output of kind STRING.
- **Shape validation only, not resolution.** Validate the pointer is a well-formed JSON Pointer (starts
  with `/`, non-empty segments) — a syntactic check. Do **not** resolve it against a `Document` here; that
  is the converter's job (issue 02) and happens in Get/Set. Resolution errors are their concern.
- **Override precedence is simple:** if the STRING input is connected, its value wins; otherwise the
  stored pointer string is used. No merging, no templating.
- **Do not add wildcard/query syntax.** Single-target index-based pointers only (PRD "Single-target
  only"); the Selector is merely the future home for that syntax.

## What to build

- **`Selector`** — one optional `STRING` input (`pointerOverride`), one `STRING` output; a public
  serialized `pointer` string property (edited in the properties pane). `_buildBlockAsync` picks the
  override value when the input is connected, else the stored `pointer`, validates its shape, and sets
  `output.value`. Sketch:

  ```ts
  // src/Blocks/selector.ts
  export class Selector extends NodeAssetBlock {
      public static override ClassName = "Selector";
      public pointer = "";                                       // edited in the properties pane
      public readonly pointerOverride: NodeAssetConnectionPoint; // STRING (optional)
      public readonly output: NodeAssetConnectionPoint;          // STRING
      // ctor: registers the optional STRING input + STRING output
      // _buildBlockAsync:
      //   const p = this.pointerOverride.isConnected ? (this.pointerOverride.value as string) : this.pointer;
      //   assert IsWellFormedPointer(p); this.output.value = p;
  }
  ```

- **Shape validation** — a small local helper (`IsWellFormedPointer`) that rejects strings not starting
  with `/` or with empty segments, throwing a clear build error naming the block and the bad pointer. Keep
  it local to the block; it is **not** the resolver.
- **Editor exposure** — a **Selectors** palette category; the Selector self-registers its descriptor with
  a text property line for the pointer. Surface the validation feedback if the property-line descriptors
  support it; otherwise the build error is enough.
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam:

- **Emits the stored pointer** — a Selector with `pointer = "/nodes/0/translation"` outputs that exact
  string on a STRING port.
- **Override wins** — feed a `StringLiteral` (issue 00) into `pointerOverride` and assert the output is
  the override, not the stored pointer.
- **Shape validation** — a malformed pointer (missing leading `/`, empty segment like
  `/nodes//translation`) produces a clear build error; a well-formed one does not.
- **Save/load roundtrip** — the `pointer` property and wiring survive serialize / `NodeAsset.Parse`.
- **Editor Playwright** only if the pointer field / Selectors palette needs interaction coverage; prefer
  headless.

## Acceptance criteria

- [ ] `Selector` exists in `src/Blocks/`, with one optional `STRING` input, one `STRING` output, and a
      public serialized `pointer` string property.
- [ ] The override input takes precedence over the stored pointer when connected; otherwise the stored
      pointer is used.
- [ ] The pointer's **shape** is validated (well-formed JSON Pointer) with a clear build error; **no**
      resolution against a `Document` happens here.
- [ ] No wildcard/query syntax is added (single-target only).
- [ ] The block self-registers, is exported from `src/index.ts`, and appears under a **Selectors** palette
      category with a pointer property line.
- [ ] Headless tests cover stored-pointer output, override precedence, shape validation, and save/load;
      they pass. `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (scalar wire kinds + literals)** — the Selector's output and override are `STRING` ports, and
  the override test feeds a `StringLiteral`. (If 00 has not landed, the STRING member can be added
  defensively, exactly as slice-02 blocks added themselves to the old switch by hand — but prefer
  sequencing after 00.)

## Note for later slices

Slices 05 (placement) and 06 (extraction) reuse this Selector to name `/nodes/i/*` and
material/texture-slot pointers. Keeping the pointer on a STRING wire (not a hidden param) is what lets
those slices fan one authored pointer into Get/Set/ExtractTexture — do **not** collapse it into the
Get/Set blocks.
