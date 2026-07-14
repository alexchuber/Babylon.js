# Context Map

Per-package domain glossaries for this repo, and how they relate. See `docs/agents/domain.md` for how
the engineering skills consume this map. Each `CONTEXT.md` is a pure glossary in the format defined by
`.agents/skills/domain-modeling/CONTEXT-FORMAT.md`. Contexts are added here as they are written; most
packages do not (yet) have one.

## Contexts

- [NodeAssets (runtime)](./packages/dev/node-assets/CONTEXT.md) — the `@babylonjs/node-assets` node
  graph and blocks that build a Babylon-ready asset. Milestone 01 does glTF in/out with Draco + KTX2;
  milestones 02–06 add the (now-retired) SCENE spine, more source formats, scalar payloads, the generic
  selector, an image lane, and scene composition. Milestone 07 replaces the single spine with three
  first-class 3D representations (glTF / USD / Babylon) connected by explicit transcoders.
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
- **The three representations, not a single spine** _(milestone 07)_: milestones 01–06 funnelled every
  3D format through one normalized gltf-transform `Document` (the **SCENE** spine). Milestone 07 retires
  the spine: a graph carries three first-class representations — **GLTF_DOCUMENT**, **USD_STAGE**,
  **BABYLON_SCENE** — with no common supertype, and the editor wires each as its own colored port kind.
  Conversion is an explicit **transcoder** node, never an implicit wire; glTF is the only export
  terminal. `SCENE` remains only as a deprecated alias for `GLTF_DOCUMENT`.

## Decisions (ADRs)

Cross-cutting decisions that shape both contexts live in `docs/adr/`:

- `0001` — the SCENE spine is the gltf-transform `Document` (every format funnels through glTF's data
  model; format lives only at import/export). **Superseded by `0004`.**
- `0002` — a wire carries a kind plus an opaque value, with a flat enum of kinds (no format/capability
  abstraction). **Superseded by `0005`.**
- `0003` — generic property access uses glTF Object Model JSON Pointers (one Selector + GetProperty +
  SetProperty triad instead of a block per property). **Extended/scoped by `0006`.**
- `0004` — three first-class 3D representations (glTF / USD / Babylon), no common supertype, glTF is the
  only export terminal; four explicit named transcoders and no implicit conversion.
- `0005` — typed representation payloads (`GltfAsset` / `UsdAsset` / `BabylonAsset`) with a build-owned
  lifecycle (cancellation, limits, disposal ledger, transferables, `LossRecord`, affine Babylon fan-out).
- `0006` — selections are domain-owned and versioned (owner / version / target kind / cardinality /
  addresses); mutators remap or invalidate them; USD edits are immutable overlays.
