# 03 — Operator block library (SCENE→SCENE, @gltf-transform/functions)

Status: ready-for-agent

## Parent

`.scratch/02-scene-spine-and-usd/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**operator block**: "a family of SCENE→SCENE middle blocks wrapping `@gltf-transform/functions`
operations … one block per operation") · Decision:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (middle blocks only ever see a `Document`).

## Goal

Grow the middle of the graph with a **family of SCENE→SCENE operator blocks**, each wrapping one
`@gltf-transform/functions` operation (dedup, prune, weld, quantize, simplify, flatten, join, and
friends). Each applies its transform to the incoming `Document` and passes it along, with its key
parameters surfaced as property lines — so a user can chain a real optimization pipeline visually between
import and export. After it, the palette has an **Operators** category with many entries.

## Why this is its own slice

This is where "breadth" becomes visible — it turns the two-compression-block middle into a real catalog.
It only needs the SCENE rename underneath it; it is independent of USD import and can run in parallel with
it. It can be delivered in **batches** of operators (each block is independently testable and landable).

## KISS ground rules (read first)

- **One block per operation**, each modeled on `dracoCompressionBlock.ts`: extend `NodeAssetBlock`, one
  `SCENE` input + one `SCENE` output, work in `_buildBlockAsync`, **dynamic-`import`**
  `@gltf-transform/functions` inside the body.
- **Do not** invent an "operator base class," an options abstraction, or a generic "apply any transform"
  block. Repetition across the ~8 operators is cheaper than the wrong abstraction (ADR 0002). A trivial
  shared local helper for the `document.transform(op(...))` call is fine; a framework is not.
- **In-place mutation is retained** for these linear chains (PRD). Fan-out correctness (copy-on-fan-out)
  is explicitly **deferred to slice 05** — do **not** attempt cloning/COW here.
- Surface **only the params that matter** per operator (e.g. simplify `ratio`/`error`, quantize
  position/normal/texcoord bits, weld `tolerance`) as property lines; keep sensible defaults for the
  rest.

## What to build

- A first, high-value **batch** — dedup, prune, weld, quantize, simplify — plus the cheaper ones
  (flatten, join, and optionally normals/center). Deliver in batches if landing incrementally.
- **Each block** — `SCENE` in → `SCENE` out; applies `document.transform(<op>({ ...params }))`; exposes
  its key params as **public serialized properties** and as **editor property lines**. Sketch:

  ```ts
  // src/Blocks/weldBlock.ts (one file per operator, modeled on DracoCompressionBlock)
  export class WeldBlock extends NodeAssetBlock {
      public static override ClassName = "WeldBlock";
      public tolerance = 0.0001;                       // surfaced as a property line
      public readonly input: NodeAssetConnectionPoint;  // SCENE
      public readonly output: NodeAssetConnectionPoint; // SCENE
      // ctor registers SCENE in/out; _buildBlockAsync dynamic-imports { weld } and
      // does: await document.transform(weld({ tolerance: this.tolerance })); output.value = document;
  }
  ```

- **Editor exposure** — an **Operators** palette category with a distinct header color from
  Sources/boundary blocks; each operator self-registers its descriptor + property section if issue 01 has
  landed, otherwise added to the existing catalog by hand (do **not** block on 01).
- Export each new block from `src/index.ts`.

## Dependencies

- Add **`@gltf-transform/functions`** to `packages/dev/node-assets/package.json` (the Draco issue flagged
  it as optional; here it is required). Keep imports **dynamic** and **inside** block bodies.
- Some operations need a peer (e.g. `simplify` uses `meshoptimizer`); add and document it if that
  operator is included. Vet provenance/license for anything new.

## Tests

Headless `buildAsync()` is the primary seam. Per operator, build ImportGLTF → operator → ExportGLTF over
a fixture and assert the operator's **observable effect on the output `Document`** (prior art: the
Draco/KTX2 tests asserting on the exported document):

- **dedup** → fewer materials/meshes/textures for a fixture with duplicates;
- **prune** → unused nodes/materials/textures removed;
- **weld** → vertex-count drop;
- **simplify** → primitive/vertex-count drop toward the target ratio;
- **quantize** → attributes quantized (declares `KHR_mesh_quantization` / reduced precision);
- **flatten / join** → node/mesh-count change as expected.

Also assert a plain Import → Export roundtrip is **unchanged**, and that operators **chain**
(e.g. Import → weld → dedup → Export) without error. **Editor Playwright** only if the Operators palette
grouping needs interaction coverage; prefer headless.

## Acceptance criteria

- [ ] A family of SCENE→SCENE operator blocks exists in `src/Blocks/`, one per `@gltf-transform/functions`
      op (dedup, prune, weld, quantize, simplify, flatten, join, + optionally normals/center), each
      modeled on `DracoCompressionBlock`.
- [ ] Each block applies its transform to the incoming `Document` and outputs the same `Document`; key
      params are public serialized properties surfaced as editor property lines.
- [ ] **No** operator base class / options abstraction / generic apply-any-transform block is introduced;
      in-place mutation is retained (fan-out deferred to slice 05).
- [ ] `@gltf-transform/functions` (+ any op peers) added as deps; imports are dynamic and inside block
      bodies; blocks exported from `src/index.ts`.
- [ ] Operators appear under an **Operators** palette category (self-registered if issue 01 landed) and
      can be chained between import and export.
- [ ] Headless `buildAsync()` tests assert each operator's observable effect on the output `Document` and
      that plain roundtrip + operator chaining still work; they pass.
- [ ] `lint:check` + `format:check` pass; new deps vetted for license/provenance.

## Blocked by

- **Issue 00 (SCENE rename)** — operators are `SCENE` → `SCENE`.
- **Benefits from** issue 01 (self-registration) for palette exposure — **not** a hard block: append to
  the existing catalog if 01 has not landed.
- **May be delivered as batches** (a first batch of core operators, then the rest); each batch is
  independently landable.
