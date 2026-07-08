# Context Map

Per-package domain glossaries for this repo, and how they relate. See `docs/agents/domain.md` for how
the engineering skills consume this map. Each `CONTEXT.md` is a pure glossary in the format defined by
`.agents/skills/domain-modeling/CONTEXT-FORMAT.md`. Contexts are added here as they are written; most
packages do not (yet) have one.

## Contexts

- [NodeAssets (runtime)](./packages/dev/node-assets/CONTEXT.md) — the `@babylonjs/node-assets` node
  graph and blocks that build a Babylon-ready asset (glTF in, glTF out, Draco + KTX2 compression).
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
