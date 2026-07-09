# Context Map

Per-package domain glossaries for this repo, and how they relate. See `docs/agents/domain.md` for how
the engineering skills consume this map. Each `CONTEXT.md` is a pure glossary in the format defined by
`.agents/skills/domain-modeling/CONTEXT-FORMAT.md`. Contexts are added here as they are written; most
packages do not (yet) have one.

## Contexts

- [NodeAssets (runtime)](./packages/dev/node-assets/CONTEXT.md) — the `@babylonjs/node-assets` node
  graph and blocks that build a Babylon-ready asset. Milestone 01 does glTF in/out with Draco + KTX2;
  milestones 02–06 add the SCENE spine, more source formats, scalar payloads, the generic selector,
  an image lane, and scene composition.
- [Node Assets Editor](./packages/tools/nodeAssetsEditor/CONTEXT.md) — the Fluent tool that visually
  authors and previews those graphs.

## Relationships

- **Node Assets Editor → NodeAssets (runtime)**: the editor authors and previews what the runtime
  builds. Its `NodeAssetGraphController` adapter owns a live `NodeAsset` (the runtime graph) and mirrors
  it into the editor's visual `GraphEditorState`; the reusable node-graph framework underneath stays
  free of runtime and gltf-transform types so it can later be promoted into a shared node editor.
- **Vocabulary split (same concept, different word per side)**: the runtime's **block / connection
  point / connection** are rendered by the editor as **node / port / wire**. Keep each word in its own
  context; each glossary lists the other side under `_Avoid_`.
- **The SCENE spine is the shared backbone**: every 3D format is transcoded on import to one normalized
  gltf-transform `Document` (the runtime's **SCENE** payload), so the editor only ever wires SCENE,
  IMAGE, and scalar ports regardless of source format.

## Decisions (ADRs)

Cross-cutting decisions that shape both contexts live in `docs/adr/`:

- `0001` — the SCENE spine is the gltf-transform `Document` (every format funnels through glTF's data
  model; format lives only at import/export).
- `0002` — a wire carries a kind plus an opaque value, with a flat enum of kinds (no format/capability
  abstraction).
- `0003` — generic property access uses glTF Object Model JSON Pointers (one Selector + GetProperty +
  SetProperty triad instead of a block per property).
