# A wire carries a kind plus an opaque value, with a flat enum of kinds

> **Status: superseded by [ADR 0005](./0005-typed-representation-payloads-and-build-lifecycle.md).** The
> flat-enum + opaque-`value` model held through the POC. Milestone 07 keeps the flat enum of kinds but
> replaces the opaque, block-interpreted `value` for the three 3D representations with concrete typed
> payload wrappers (GltfAsset / UsdAsset / BabylonAsset) whose lifecycle is owned by the build scope.
> The reasoning below is retained as the record of the original trade-off.

A connection's payload is modelled as its `NodeAssetConnectionPointType` (the kind) plus an untyped
`value` slot the block bodies interpret; the type enum is a flat, hand-maintained list
(`SCENE/GLTF`, `IMAGE`, `BYTES`, `NUMBER`, `STRING`, `JSON`) rather than a format/capability
abstraction or a class hierarchy. We chose this because `connectTo()` only needs the kind to
reject mismatched wires, and everything richer (a format registry, capability negotiation, per-kind
wrapper classes) was considered and cut as premature for a breadth-first POC — repetition inside
block bodies is cheaper than a wrong abstraction.

> **Historical accuracy note (milestone 07).** The list above (and the original NodeAssets glossary)
> named a **`BYTES`** kind, but the **actual shipped `NodeAssetConnectionPointType` enum never had
> `BYTES`** — its kinds were only `SCENE`, `NUMBER`, `STRING`, `JSON`, `IMAGE`. Treat the `BYTES`
> mention here as a stale/inaccurate historical artifact, not a description of the real enum.

## Consequences

- Adding a new payload kind is a one-line enum addition plus blocks that read/write that `value`
  shape; no framework change.
- Type safety at the wire is nominal (kind equality only); blocks trust the `value` matches the
  kind. Acceptable while the graph is small.
