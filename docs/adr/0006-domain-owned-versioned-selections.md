# Selections are domain-owned and versioned, per representation

> **Status: accepted. Extends and scopes [ADR 0003](./0003-generic-selector-is-gltf-object-model-json-pointer.md)**
> (the glTF Object Model JSON Pointer selector triad).

A **selection** is owned by the representation domain it addresses and carries **owner, version, target
kind, cardinality, and addresses**; it is not a bare string. ADR 0003's glTF Object Model JSON Pointer
becomes _one domain's_ address scheme — the glTF domain's — rather than a universal selector. USD uses
**immutable overlay selectors** instead (edits are additive overlays on the frozen stage, never
in-place mutation), and `NODE_GEOMETRY` stays unevaluated until an explicit `Evaluate`, then `Bake`s to
Babylon. We chose domain-owned versioned selections because, once there are three representations whose
structure changes under mutation, a bare pointer silently rots: after a mutator reindexes or removes a
target, an old pointer either resolves to the wrong thing or fails opaquely. Versioning + owner lets a
mutator **remap or explicitly invalidate** the selections it affects.

## What a selection carries

- **owner** — which representation domain (glTF / USD / Babylon) the selection belongs to; a selection
  is only valid against its owner's payload.
- **version** — the payload revision the addresses were resolved against; a stale version triggers
  remap-or-invalidate rather than a silent wrong resolve.
- **target kind** — what the addresses point at (node, material, texture slot, primvar, …).
- **cardinality** — single vs multi-target (ADR 0003's single-target pointers are the cardinality-1
  case; wildcards/queries are the multi-target case).
- **addresses** — the concrete locators in the owner's scheme (glTF Object Model JSON Pointers for
  glTF; USD prim/property paths for USD; scene-object references for Babylon).

## Consequences

- **Mutators remap or invalidate.** A block that restructures a representation updates the versions and
  addresses of live selections it affects, or marks them invalid with a diagnostic — no silently
  dangling pointer.
- **USD edits are immutable overlays.** A USD selector names prims/properties on the frozen
  `IResolvedStage`; a USD "edit" records an overlay entry, leaving the resolved stage untouched. This is
  what lets `UsdAsset` be shared (not cloned) on fan-out (ADR 0005).
- **glTF keeps the ADR 0003 triad**, now typed as an owner=glTF, JSON-Pointer-addressed selection.
  Existing Selector / GetProperty / SetProperty / ExtractTexture / SetTexture behavior is unchanged for
  glTF graphs.
- **NodeGeometry is import-then-evaluate.** Importing NodeGeometry does **not** build geometry; an
  explicit `Evaluate` runs the procedural graph, and a `Bake` turns the result into a Babylon
  representation. Selections over NodeGeometry only become resolvable after `Evaluate`.
- **Resource lanes are editor grouping/metadata only**, not a selection or type-system axis; a lane
  never changes which domain owns a selection.

## Decided behavior vs. implementation-owned encoding

All **observable** selection behavior is **decided and first-class**, not an open product question:

- A **domain-owned, owner/versioned exact `Selection` value is a first-class, capturable wire value** in
  the concrete typed value map — a graph can capture it and flow it on a wire.
- A selection is **routable / fan-out within its own owner domain** and **rejected cross-domain** (a glTF
  selection cannot be consumed by a USD/Babylon block, and vice versa).
- **Remap / invalidate semantics are fixed**: a mutator that restructures a representation remaps the
  live selections it affects, or invalidates them with a diagnostic; a stale-version selection never
  silently mis-resolves.

The **only** thing left implementation-owned is the **non-observable TypeScript encoding** — e.g.
interface vs class, discriminated union vs boxing — chosen in the domain issues (tests-first) as long as
the observable acceptance behavior above holds. This is not a product-level open question.
