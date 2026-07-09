# 02 — glTF Object Model pointer → gltf-transform accessor converter

Status: ready-for-agent

## Parent

`.scratch/03-scalar-wires-and-selectors/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**property accessor**: "the `get` / `getTarget` / `set` / `type` handle a pointer resolves to, produced
by NAE's own path→accessor converter over the gltf-transform `Document` … the analog of the glTF loader's
`GLTFPathToObjectConverter` / `IObjectAccessor`, but targeting gltf-transform properties") · Decision:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (NAE owns a Document-targeted
converter mirroring the loader's; the two accessor target types deliberately differ).

## Goal

Build the **one genuinely new piece of logic** in slice 03: an NAE-side converter that resolves a glTF
Object Model JSON Pointer against the gltf-transform `Document` and returns a **property accessor** — a
`{ get, set, type }` (and `getTarget` where useful) handle over the resolved property. This is the
reusable heart that GetProperty (03) and SetProperty (04) call, and that slices 05 (placement) and 06
(extraction) reuse. It borrows the loader's pointer **grammar and accessor concept** but targets
gltf-transform properties, not Babylon scene objects.

## Why this is its own slice

It is pure, self-contained logic with no block, port, or editor surface, and it is the single largest and
riskiest new piece in the slice. Landing it as its own foundation issue — verifiable entirely through
focused get-then-set unit tests — lets GetProperty and SetProperty be thin, symmetric, **parallel** slices
that both just call it. "Make the change easy, then make the easy change." Investing in a clean mapping
table here pays off in three later blocks.

## KISS ground rules (read first)

- **Borrow the concept, not the code.** Mirror the shape of the loader's `GLTFPathToObjectConverter` +
  `IObjectAccessor` (`get` / `getTarget` / `set` / `type`) — prior art at
  `packages/dev/loaders/src/glTF/2.0/Extensions/gltfPathToObjectConverter.ts` and its mapping in
  `objectModelMapping.ts` — but resolve against **gltf-transform's `Document`** property graph
  (`getRoot().listNodes()[0]`, `material.getEmissiveFactor()` / `setEmissiveFactor()`), not the loader's
  live Babylon objects. Do **not** import the loader or drag the glTF loader into the runtime (ADR 0003).
- **A mapping table, not a framework.** A data-driven table mapping pointer segments to gltf-transform
  getters/setters is enough. Cover the common surface; do not attempt the entire glTF object model.
- **Single-target, index-based only.** Resolve exactly one property per pointer. No wildcards
  (`/materials/*/…`), no by-name queries — explicitly deferred (PRD "Single-target only").
- **Fail loudly.** An out-of-range index or unknown property segment throws a clear error naming the
  offending pointer (this is what the Get/Set bad-pointer tests observe).

## What to build

- A **path→accessor converter** module under `src/` (e.g. `src/selector/pointerToAccessor.ts`) exposing a
  resolver: given a `Document` and a pointer string, return a `PropertyAccessor` —
  `{ get(): unknown; set(value: unknown): void; type: ...; getTarget?(): unknown }` — bound to the
  resolved gltf-transform property, or throw if the pointer doesn't resolve.
- A **mapping table** covering the common surface (the gltf-transform analog of the loader's
  `objectModelMapping`):
  - **node TRS** — `/nodes/{i}/translation` · `/rotation` · `/scale`
    (→ `node.getTranslation()` / `setTranslation()`, etc.);
  - **PBR material factors** — `/materials/{i}/emissiveFactor`,
    `/materials/{i}/pbrMetallicRoughness/baseColorFactor`, `metallicFactor`, `roughnessFactor`
    (→ the matching gltf-transform `Material` getters/setters; the glTF-nested pointer maps to
    gltf-transform's flattened API);
  - **material texture slots** — the common slots (baseColor, normal, metallicRoughness, emissive)
    resolving to the texture property (the seam issue 06's IMAGE-typed ExtractTexture builds on);
  - **mesh / camera basics** — enough to prove the table generalises beyond materials/nodes;
  - **`extras` passthrough** — `/…/extras/{key}` resolves to the target property's `extras` object so
    arbitrary data can be read/written (the use case `SetExtras` was meant to cover).
- **Pointer parsing** — split on `/`, walk root / collection / index / property segments; validate each
  segment resolves (index in range, property known) and throw a clear pointer error otherwise.

## Tests

This module is verified by focused **unit tests** (its own new logic; the block-level `buildAsync()` seam
is exercised by issues 03/04):

- **Get-then-set round-trip per supported pointer family** — build a small in-code `Document`, resolve a
  pointer, assert `get()` returns the current value, `set(v)` mutates it, and a fresh `get()` returns `v`.
  One test per family: node TRS, a material factor, a texture slot, and an `extras` write (prior art: the
  loader's object-model pointer tests at
  `packages/dev/loaders/test/unit/Interactivity/objectModel.test.ts`).
- **Bad-pointer errors** — an out-of-range index (`/nodes/99/translation`), an unknown property
  (`/materials/0/bogus`), and a malformed pointer each throw a clear error naming the pointer.
- **`type` reporting** — the accessor's reported `type` matches the resolved property (spot-check a couple
  of families) so Get/Set can rely on it.

## Acceptance criteria

- [ ] A converter module exists under `packages/dev/node-assets/src/` that, given a gltf-transform
      `Document` + a pointer string, returns a `{ get, set, type }` accessor bound to the resolved property
      (or throws).
- [ ] A data-driven mapping table covers node TRS, PBR material factors, common material texture slots,
      mesh/camera basics, and an `extras` passthrough — resolving against gltf-transform properties, **not**
      Babylon scene objects.
- [ ] The glTF loader is **not** imported; only the pointer grammar + accessor concept are borrowed
      (ADR 0003).
- [ ] Resolution is single-target and index-based; wildcards / by-name queries are **not** implemented.
- [ ] Out-of-range indices, unknown properties, and malformed pointers throw clear pointer-naming errors.
- [ ] Focused unit tests cover a get-then-set round-trip per pointer family plus the bad-pointer cases;
      they pass. `lint:check` + `format:check` pass.

## Blocked by

None — it is pure `Document` logic with no dependency on the enum, literals, or Selector, so it can start
immediately, in **parallel** with issue 00. **Unblocks** issue 03 (GetProperty) and issue 04
(SetProperty), and is reused by slices 05 (placement) and 06 (extraction).
