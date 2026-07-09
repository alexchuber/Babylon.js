# A wire carries a kind plus an opaque value, with a flat enum of kinds

A connection's payload is modelled as its `NodeAssetConnectionPointType` (the kind) plus an untyped
`value` slot the block bodies interpret; the type enum is a flat, hand-maintained list
(`SCENE/GLTF`, `IMAGE`, `BYTES`, `NUMBER`, `STRING`, `JSON`) rather than a format/capability
abstraction or a class hierarchy. We chose this because `connectTo()` only needs the kind to
reject mismatched wires, and everything richer (a format registry, capability negotiation, per-kind
wrapper classes) was considered and cut as premature for a breadth-first POC — repetition inside
block bodies is cheaper than a wrong abstraction.

## Consequences

- Adding a new payload kind is a one-line enum addition plus blocks that read/write that `value`
  shape; no framework change.
- Type safety at the wire is nominal (kind equality only); blocks trust the `value` matches the
  kind. Acceptable while the graph is small.
