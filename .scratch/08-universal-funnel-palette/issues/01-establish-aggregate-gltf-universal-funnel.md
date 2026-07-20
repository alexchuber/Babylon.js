# Establish the aggregate-backed glTF Universal funnel

Status: ready-for-agent

## What to build

Deliver the first complete `Import glTF → Universal → Export glTF` path and the reusable aggregate model that every later source funnel and convenience aggregate will use.

Universal must be a distinct public connection point type even though its proof-of-concept value is backed by a gltf-transform document. Implement the ordinary primitive composition `Read glTF → glTF → Universal → Universal → glTF → Write glTF`, then expose `Import glTF` and `Export glTF` as real typed aggregate blocks over those primitives.

This slice owns the tightly coupled aggregate behavior end to end: compact aggregate nodes, frame-like expand/collapse with type-accurate internal nodes and wires, aggregate serialization, expansion-state persistence, detachment into a `CustomAggregateBlock` before internal edits, and child property/action forwarding. `Import glTF` and `Read glTF` must share URL/upload source state; `Export glTF` and `Write glTF` must share file name and **Export .glb** behavior. Every node must expose editable **Name** and read-only **Type**, where Type is the runtime block class name.

Keep Universal's gltf-transform implementation behind the Universal type seam. Do not migrate the complete palette or built-in library in this slice.

This is the deliberate exception to the roughly four-hour target: splitting the aggregate runtime, editor expansion, persistence, and property forwarding would leave unusable intermediate aggregates. Keep the work cohesive rather than landing a placeholder aggregate API.

## User stories covered

1-3, 7-20, 28, 32-33, 36-38, 53-54, 61-63.

## Acceptance criteria

- [ ] glTF and Universal are distinct connection point types and cannot connect without `glTF → Universal` or `Universal → glTF`; focused tests prove the mismatch remains invalid despite a shared internal document implementation.
- [ ] `Read glTF` accepts either a URL or uploaded glTF/GLB, persists uploaded-source data using the established source persistence behavior, and makes the last successful source choice active.
- [ ] The explicit primitive path builds a non-empty valid GLB, and `Import glTF`/`Export glTF` produce the same externally meaningful asset result as their documented primitive subgraphs.
- [ ] Aggregate blocks own typed ordinary-block subgraphs rather than executing hidden mega-block logic; their compact public ports match the exposed internal connection points.
- [ ] The editor expands and collapses each aggregate into type-accurate primitive nodes and wires without changing graph behavior.
- [ ] Editing an aggregate's internals first detaches it into a `CustomAggregateBlock`; saving, loading, and rebuilding preserve the detached owned subgraph.
- [ ] Save/load preserves built-in aggregate identity, behavior, public ports, configuration, and expansion state using a versioned encoding.
- [ ] Aggregate properties contain their own GENERAL section followed by configurable child sections/actions with clear child attribution and no duplicate child Name/Type controls.
- [ ] Selecting `Import glTF` or its `Read glTF` child edits the same URL/upload state; selecting `Export glTF` or its `Write glTF` child edits the same filename and downloads the same non-empty, correctly named GLB.
- [ ] Every primitive, aggregate, and custom aggregate node exposes editable **Name** and read-only **Type** with the exact runtime class name.
- [ ] Runtime tests use public build/serialization behavior and asset facts rather than private aggregate storage or mocked child-call order.
- [ ] Playwright covers compact build/preview, expand/collapse, save/reload, detach/customize/build, shared source properties, and both export action surfaces.
- [ ] A fresh-context verifier who did not implement the slice reruns the focused runtime and Playwright checks and records evidence against every acceptance criterion before the issue is marked resolved.

## Blocked by

None - can start immediately.
