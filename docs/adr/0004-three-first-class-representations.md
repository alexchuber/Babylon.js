# Three first-class 3D representations, glTF is the only terminal

> **Status: accepted. Supersedes [ADR 0001](./0001-scene-spine-is-gltf-transform-document.md)** (the
> single gltf-transform Document spine).

A NodeAssets graph carries **three first-class in-graph 3D representations, with no common scene
supertype**: `GLTF_DOCUMENT` (a glTF-Transform `Document`), `USD_STAGE` (a frozen, dependency-free
`IResolvedStage` plus an immutable Node Assets overlay), and `BABYLON_SCENE` (a live `NullEngine` +
`Scene`). Conversion between representations happens only through **explicit, named transcoders**, and
**glTF is the sole 3D export terminal**. We chose this over ADR 0001's single normalized spine because
funnelling USD and Babylon through glTF on import destroyed exactly the data those pipelines exist to
work with (USD composition/variants/layering; Babylon runtime constructs), forcing loss *before* the
user had done anything, and because glTF's own charter is transmission/"last mile" delivery, not
authoring interchange — a poor universal working representation but the correct delivery target.

## Considered Options

- **Keep the single gltf-transform spine (ADR 0001).** Rejected: every non-glTF pipeline paid glTF's
  loss on import even when it never needed glTF semantics; USD- and Babylon-native edits were
  impossible because the data was already gone.
- **A generic/neutral 3D representation the wire speaks, with implicit conversion.** Rejected for v1:
  reintroduces a mandatory hub (the spine problem in disguise), needs capability negotiation and a
  multi-hop path planner, and hides lossy conversions the user should choose deliberately.
- **A common scene supertype / union / `Switch` block the three representations share.** Rejected: a
  supertype either leaks to the widest capability (USD) or narrows to the smallest (glTF); either way
  blocks would branch on the concrete kind anyway. Keeping three distinct kinds makes the loss explicit
  at the transcoder boundary instead of implicit in a supertype.

## Consequences

- The connection-point kind enum gains `GLTF_DOCUMENT`, `USD_STAGE`, `BABYLON_SCENE`. `SCENE` remains
  **only** as a deprecated source alias for `GLTF_DOCUMENT` (back-compat for milestone 01–06 graphs and
  snippets); nothing new should emit `SCENE`.
- v1 ships four explicit named transcoders and no others: **USD2glTF**, **USD2Babylon** (via the USD
  loader's `AdaptResolvedStageToScene`), **glTF2Babylon** (via the mature glTF 2.0 loader), and
  **Babylon2glTF** (via the glTF serializer). There is **no** implicit conversion, generic
  representation wire, union/`Switch`, mandatory neutral hub, or multi-hop path planner in v1.
- Because glTF is the only terminal, every graph that must export a 3D deliverable ends at a glTF
  representation; USD- and Babylon-native middle work must transcode to glTF before export, and that
  transcode is where loss is surfaced (see ADR 0005's LossRecord).
- `NODE_GEOMETRY` is a procedural resource, not a representation; `IMAGE` and scalars remain resources
  and values. Representations are the three 3D kinds only.
- Transcoders are inherently lossy funnels in both directions (glTF cannot express USD composition;
  USD is a superset). Each transcoder's loss profile is documented and surfaced as diagnostics rather
  than hidden.
