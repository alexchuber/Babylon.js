# PRD — 03 Scalar wires & generic selectors

> Milestone 03 of the NodeAssets POC. The pivotal slice: it replaces one-off property nodes with a
> single generic selector mechanism, and gives the graph its first non-SCENE payloads. Subsumes the
> rejected `SetExtras` idea and lays the groundwork reused by slices 05 and 06.

## Problem Statement

Right now every wire carries a whole SCENE, and there is no way to reach *into* a scene to read or
change a single property. If I want to set a material's colour, nudge a node's position, or stamp a
custom value onto an object, my only option is a bespoke block hand-written for that one property —
and those single-purpose nodes (the `SetExtras` block I sketched) are near-useless and multiply
endlessly. There is also no way to carry a plain number, a string, or a small blob of JSON along a
wire, so nodes can't be parameterised by upstream values. I want a small, generic vocabulary for
"point at a property and read or write it," plus scalar payloads to feed it.

## Solution

Add three scalar wire kinds — **NUMBER**, **STRING**, **JSON** — with matching literal source nodes.
Introduce the generic selector triad, modelled on the **glTF Object Model JSON Pointer** (the Khronos
standard used by Babylon's animation-pointer / interactivity and by FlowGraph):

- a **Selector** node emits a pointer string such as `/nodes/0/translation` or
  `/materials/2/pbrMetallicRoughness/baseColorFactor`;
- a **GetProperty** node reads the value at that pointer out of a SCENE;
- a **SetProperty** node writes a value at that pointer into a SCENE.

One triad replaces an unbounded family of property-specific nodes, and the same mechanism is reused
by later slices for placement (05) and extraction (06). (See ADR 0003.)

## User Stories

1. As a pipeline author, I want a Number literal node, so that I can supply a numeric constant to a
   node's input.
2. As a pipeline author, I want a String literal node, so that I can supply text (including a pointer)
   to a node's input.
3. As a pipeline author, I want a JSON literal node, so that I can supply a structured value (array,
   object) to a node's input.
4. As a pipeline author, I want a Selector node where I type a glTF pointer, so that I can name any
   property I want to read or write.
5. As a pipeline author, I want the Selector to validate the pointer's shape, so that I catch typos
   before I build.
6. As a pipeline author, I want to drive the Selector's pointer from an upstream String, so that I can
   compute which property to target.
7. As a pipeline author, I want a GetProperty node that takes a SCENE and a pointer and outputs the
   value there, so that I can extract a property to use elsewhere.
8. As a pipeline author, I want a SetProperty node that takes a SCENE, a pointer, and a value and
   outputs the modified SCENE, so that I can change any property in the pipeline.
9. As a pipeline author, I want to set a material's base-colour factor via SetProperty, so that I can
   recolour an asset without a bespoke node.
10. As a pipeline author, I want to set a node's translation/rotation/scale via SetProperty, so that I
    can reposition parts of the scene.
11. As a pipeline author, I want to write arbitrary data under an object's `extras` via SetProperty,
    so that I can stamp custom properties onto the asset (the use case `SetExtras` was meant to cover).
12. As a pipeline author, I want to read a material factor or node transform via GetProperty, so that I
    can feed it into other nodes or copy it across objects.
13. As a pipeline author, I want these nodes grouped in the palette (Values / Selectors), so that the
    growing catalog stays navigable.
14. As a pipeline author, I want a clear error when a pointer resolves to nothing (bad index, missing
    property), so that I understand why a build failed.

## Implementation Decisions

- **Enum additions.** Add `NUMBER`, `STRING`, `JSON` to `NodeAssetConnectionPointType` alongside
  `SCENE`. Wire type-checking stays kind-equality only (ADR 0002).
- **Literal source nodes.** `NumberLiteral`, `StringLiteral`, `JsonLiteral` — no inputs, one typed
  output, value edited in the properties pane (existing text/slider descriptors).
- **Selector node.** Holds a pointer string (editable), optionally overridable by a STRING input, and
  outputs the pointer as a `STRING`. It is the natural home for future wildcard/query syntax. Keeping
  the pointer on a wire (rather than a hidden param) is what makes Get/Set composable.
- **Pointer resolution — NAE-side converter.** Add a small path→accessor converter that resolves a
  glTF Object Model pointer against the gltf-transform `Document`, mirroring the loader's
  `GLTFPathToObjectConverter` + `IObjectAccessor` (get / getTarget / set / type) but targeting
  gltf-transform properties: `/nodes/0` → `getRoot().listNodes()[0]`; `/materials/2/emissiveFactor` →
  material `getEmissiveFactor()` / `setEmissiveFactor()`; `/.../extras/<key>` → the property's extras
  object. Ship a mapping table covering the common surface — node TRS, the PBR material factors and
  texture slots, mesh/camera basics, and an `extras` passthrough. This is the gltf-transform analog of
  the loader's `objectModelMapping`, deliberately a separate target type (ADR 0003).
- **GetProperty.** Inputs SCENE + STRING(pointer); resolves to an accessor; outputs `accessor.get()`
  as `JSON`.
- **SetProperty.** Inputs SCENE + STRING(pointer) + JSON(value); resolves to an accessor; calls
  `accessor.set(value)`; outputs the (in-place-mutated) SCENE. Value currency is `JSON` because glTF
  property values are naturally JSON-serialisable; NUMBER/STRING literals that need to feed a value
  port can be wrapped as JSON.
- **Single-target only.** Pointers are index-based and address exactly one property. Wildcards
  (`/materials/*/…`) and by-name queries are explicitly deferred (additive later).
- **In-place mutation retained**; fan-out safety is slice 05's job.

## Testing Decisions

- **Reuse the headless `buildAsync()` SCENE seam** as the primary observation point. A good test
  builds a graph, exports, re-parses the output Document, and asserts the property changed — it never
  reaches into block internals.
- **SetProperty end-to-end:** ImportGLTF → SetProperty(`/materials/0/emissiveFactor`, `[1,0,0]`) →
  Export; assert material 0's emissive is red in the output. Same shape for a node translation and for
  an `extras` write. Prior art: the milestone-1 roundtrip and compression assertions.
- **GetProperty observed through the same seam:** route the read value back into the SCENE via a
  SetProperty into `extras` (get → set → export), then assert the value shows up in the exported
  Document. This keeps the test on the existing SCENE seam rather than inventing a scalar sink.
- **Converter round-trip (unit):** the path→accessor converter is the one genuinely new piece of
  logic; a focused get-then-set round-trip test per supported pointer family (node TRS, material
  factor, texture slot, extras) is warranted. Prior art: the loader's object-model pointer tests.
- **Bad-pointer test:** a pointer with an out-of-range index or unknown property produces a clear
  build error.

## Out of Scope

- Multi-target selection / wildcards / by-name queries.
- Rich numeric or expression nodes (math, string manipulation) beyond literals — add later if a slice
  needs them.
- Type-safe value ports (choosing NUMBER vs. array vs. object per pointer). Value currency is JSON for
  now.
- Extracting a texture *as an image* — that is slice 06, which builds a specialised Get on top of this
  converter.

## Further Notes

- The converter is the reusable heart of slices 05 (placement = SetProperty on `/nodes/i/*`) and 06
  (extraction = GetProperty on material/texture slots). Investing in a clean mapping table here pays
  off twice.
- We deliberately borrow only the *grammar and accessor concept* from Babylon's loader, not its code
  path — the loader resolves against live Babylon scene objects, NAE against the gltf-transform
  Document. Keeping these separate avoids dragging the glTF loader into the runtime.
- Naming the pointer output a `STRING` (not a bespoke `POINTER` kind) keeps the enum flat and lets
  pointers be produced by ordinary string nodes; a dedicated kind can come later if validation needs
  it.
