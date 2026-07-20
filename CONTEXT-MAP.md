# Context Map

Per-package glossaries for the NodeAssets runtime and Node Assets Editor. Each `CONTEXT.md` is a pure
glossary using the format in `.agents/skills/domain-modeling/CONTEXT-FORMAT.md`.

## Contexts

- [NodeAssets (runtime)](./packages/dev/node-assets/CONTEXT.md) - the typed asset-processing graph that
  funnels supported source payloads into Universal, applies reusable optimization, and produces GLB.
- [Node Assets Editor](./packages/tools/nodeAssetsEditor/CONTEXT.md) - the visual authoring tool for
  NodeAssets graphs, including aggregates, palette discovery, properties, preview, and the pipeline
  library.

## Relationships

- **Node Assets Editor -> NodeAssets**: the editor authors, builds, saves, loads, and previews runtime
  graphs.
- **Vocabulary split**: the runtime's block, connection point, and connection are rendered by the editor
  as node, port, and wire. Keep each word in its own context.
- **Universal funnel**: glTF, USD, Babylon, and Node Geometry source payloads cross explicit transcoders
  into Universal. Universal is the content-optimization trunk and exits only to glTF; glTF is the sole
  delivery lane and GLB is the sole output.
- **Aggregate presentation**: runtime aggregate blocks are displayed as compact aggregate nodes. The
  editor can expand them into their primitive subgraphs without changing graph behavior.

## Current Decision Source

The canonical proof-of-concept product model is
[PRD 08 - Universal funnel palette](./.scratch/08-universal-funnel-palette/PRD.md). When older milestone
documents conflict with that model, PRD 08 and these glossaries take precedence.

## Earlier ADRs

- `0001` defined the retired SCENE spine. The current model uses the distinct public term Universal and
  preserves explicit source and target format types.
- `0002` established typed wire payloads. Its flat-kind principle remains compatible with the current
  model.
- `0003` defined selector-based property access. Selectors and values are outside the current product
  surface.
- `0004` defined three independently operable representations and pairwise transcoders. That direction
  is superseded for the proof of concept by the Universal funnel.
- `0005` established build-owned lifecycle behavior. That behavior remains, but its old
  representation-specific product promises are not part of the current palette.
- `0006` defined domain-owned selections. Selections are outside the current product surface.
