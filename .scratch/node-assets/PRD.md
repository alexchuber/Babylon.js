# PRD: NodeAssets

Status: ready-for-agent

A node-based content-pipeline API and a companion visual node editor for Babylon.js. It takes
source/DCC assets (glTF today; USD and images later) through composable **operations** and
outputs an optimized, Babylon-ready glTF. Internally powered by gltf-transform, behind a thin
per-format abstraction so other formats and engines can be added later.

Inspired by the old "Polymorph" concept: a shared, recombinant toolkit for the messy middle
between creation assets (CAD, USD) and consumption assets (glTF). This is a proof of concept, not
a production system — keep it black-box and defer deep internal-architecture commitments.

> Terms in **bold** on first use are defined in the Glossary (Further Notes). The vocabulary is
> deliberate — several terms exist to avoid colliding with existing Babylon concepts. Use this
> vocabulary consistently in the issues derived from this PRD.

---

## Problem Statement

Everyone who prepares 3D content for the web solves the same "messy middle" by hand. Turning a
creation asset (a CAD export, a USD, a raw glTF) into an optimized, runtime-ready glTF means
stringing together operations — mesh decimation here, texture compression there, format
conversion somewhere else — and almost everyone builds their own one-off pipeline to do it. These
pipelines don't compose, don't reuse each other's work, and can't be shared. A creator who just
wants "import this glTF, compress it, and give me a smaller glTF back" has no single place to
assemble those steps, see the real result, and reuse the same recipe next time.

## Solution

**NodeAssets**: one shared set of composable operations exposed through two surfaces —

1. A **code API**: a functional, fluent builder for assembling a pipeline in TypeScript.
2. A **visual node editor** (the "Node Assets Editor"): a fresh, Fluent-based canvas for
   assembling the same pipeline by dragging **nodes** and connecting them with **wires**.

Both surfaces are just two projections of the same operation set, so they can never drift apart.
The editor shows a **live 3D preview of the real output**: whenever the graph changes, it re-runs
the whole pipeline, writes the actual optimized glTF (which is when compression really happens),
and loads those bytes back through Babylon's glTF loader into a viewport — so what you see is
exactly what would ship.

The first milestone is a working, zero-install web editor with the flow **Import glTF → Draco →
KTX2 → Export glTF**, running entirely in the browser like every other Babylon editor. The graph
is drawn as a straight line in this milestone, but the underlying model is a branching graph from
day one so the future use cases below stay reachable.

## User Stories

### Assembling a pipeline in the visual editor

1. As a pipeline author, I want to drag operations from a palette onto a canvas, so that I can
   assemble a pipeline visually without writing code.
2. As a pipeline author, I want to add a **source** node that imports a glTF, so that my pipeline
   has an input asset to work on.
3. As a pipeline author, I want to connect one node's output to another node's input with a
   **wire**, so that the asset flows through my chosen operations in order.
4. As a pipeline author, I want to add a Draco operation, so that my output glTF's geometry is
   compressed.
5. As a pipeline author, I want to add a KTX2 operation, so that my output glTF's textures are
   compressed.
6. As a pipeline author, I want to add a **sink** node that exports a glTF and configure its
   settings (e.g. filename), so that the export configuration is visible on the canvas and saved
   with the graph rather than hidden in an app button.
7. As a pipeline author, I want a properties panel for the selected node, so that I can edit that
   operation's settings (quality, method, format, etc.).
8. As a pipeline author, I want the editor to prevent me from connecting incompatible ports, so
   that I can't accidentally wire an image into a slot that expects a glTF.
9. As a pipeline author, I want a warning when I place a content-editing operation after a
   compression operation, so that I don't silently produce a broken or suboptimal pipeline.
10. As a pipeline author, I want to save my graph and reload it later, so that I can reuse and
    iterate on a pipeline over time.

### Live preview

11. As a pipeline author, I want a 3D viewport on the canvas showing the actual output asset, so
    that I can see the real, compressed result — not an approximation.
12. As a pipeline author, I want the preview to update automatically after I change the graph, so
    that I don't have to trigger a rebuild manually.
13. As a pipeline author, I want automatic rebuilds to be debounced (~10 seconds after my last
    change), so that rapid edits don't thrash the slow encoders.
14. As a pipeline author, I want an in-flight rebuild to be superseded when I make another change,
    so that I'm never waiting on a stale result.
15. As a pipeline author, I want clear indicators of preview state (waiting, rebuilding, done,
    errored), so that I always know whether what I'm looking at is current.
16. As a pipeline author, I want to preview any node's intermediate result, not just the final
    export, so that I can inspect the asset partway through the pipeline.
17. As a pipeline author, I want the preview to double as a validity check that the output loads,
    so that I find out immediately if my pipeline produces an unloadable asset.
18. As a pipeline author, I want re-running the graph after a small change to be cheap, so that
    only the changed node and everything downstream of it re-runs (via per-node memoization).

### Assembling a pipeline in code

19. As a developer, I want a fluent builder to assemble the same pipeline in TypeScript, so that I
    can script pipelines and run them outside the editor.
20. As a developer, I want each builder call to add a node and return a **handle** I can chain
    from, so that authoring reads naturally as a sequence of operations.
21. As a developer, I want autocomplete for operations and their settings, so that I get normal
    editor tooling despite the operations coming from a registry.
22. As a developer, I want branches captured in variables and merges expressed by passing a handle
    as an argument, so that non-linear pipelines are expressible in code.
23. As a developer, I want my authored pipeline to compile down to a plain, serializable **graph
    document**, so that code-authored and editor-authored pipelines share one storage format.
24. As a developer, I want to run a graph definition to produce the output glTF bytes, so that I can
    integrate NodeAssets into my own build or tooling.
25. As a developer, I want a pipeline authored in the editor to run identically in code (and vice
    versa), so that the two surfaces are interchangeable.

### Authoring new operations

26. As an operation author, I want to register a new **operation** once, so that it appears in
    both the code API and the editor palette without duplicated wiring.
27. As an operation author, I want to declare named, typed input **ports** and an output type, so
    that the editor can validate connections and the code API can type the handles.
28. As an operation author, I want to provide default settings for my operation, so that a
    freshly-added node is usable immediately.
29. As an operation author, I want my operation's `run` to be able to use any engine (not just
    gltf-transform) and write results back through the document, so that operations gltf-transform
    can't perform (like in-browser KTX2) still fit the same node interface.
30. As an operation author, I want to tag my operation's **phase** (content or compression), so
    that the "compression comes last" validation works automatically.

### Packaging and reuse

31. As a Babylon maintainer, I want heavy libraries (gltf-transform, the WASM encoders) to load on
    demand, so that the base bundle stays small.
32. As a Babylon maintainer, I want the KTX2 node to reuse the existing browser Basis encoder
    prototype rather than a re-implementation, so that we don't duplicate proven worker/WASM
    plumbing.
33. As a Babylon maintainer, I want the new package to follow existing repo conventions, so that
    it fits the monorepo the way other dev/tool packages do.

### Future use cases that must stay reachable (not built in the first milestone)

34. As a pipeline author, I want to convert a USD (or a PNG) into a glTF-native representation via
    an explicit conversion node, so that I can bring non-glTF sources into the pipeline later.
35. As a pipeline author, I want to customize content — add metadata, reassign materials, generate
    LODs — with operations that edit content while keeping the format, so that I can tailor an
    asset without leaving glTF.
36. As a pipeline author, I want to compose multiple inputs — merge several assets, or add an
    externally-sourced image as a texture — via a multi-input node, so that I can build up a
    combined asset.
37. As a pipeline author, I want to branch the graph (fan-out and merge), so that I can process
    side-branches (e.g. extracted textures) independently and recombine them.
38. As a platform owner, I want to add a Node/cloud backend for heavy operations (Simplygon-class)
    later without redesigning the run layer, so that all-browser today doesn't wall off server-side
    processing tomorrow.

## Implementation Decisions

### One operation registry, two surfaces

- A **single operation registry** is the source of truth. Each operation is registered once with:
  an id, a label, its input ports (each a name plus a format type), its output type, its default
  settings, an optional phase, and a `run` function. The code API's fluent methods, the editor's
  node palette, and the graph-definition loader all read from this one registry, which is what
  prevents the two surfaces from drifting apart.
- On top of the registry sit **thin, typed wrappers** so the code API gets normal autocomplete for
  operations and their settings.
- The design is **functional, not object-oriented**: there is no class per operation. There is one
  builder object plus a set of registered operation definitions, mirroring how gltf-transform
  itself is structured.

### How assets flow (the graph model)

- **Coarse, whole-asset wires.** The entire **asset** flows down each wire; a node takes an asset
  in, mutates or derives it, and passes it on (the Houdini/Substance model). An operation's
  individual settings are properties on its node, not separate input wires.
- **Wires are typed by format** (glTF, USD, image, …). The editor only permits connections between
  compatible types. Crossing formats requires an explicit conversion node. (First milestone is
  glTF-only, so this is trivially satisfied but designed in from the start.)
- **Named, typed, multi-input ports.** A node may have several named input ports (e.g. an
  "apply texture" node with a `base` glTF port and an `image` port). Sources have zero inputs; most
  operations have one; composing operations have two or more. Multi-input is the load-bearing
  requirement — it's why the model is a registry-with-ports rather than a linear chain.
- **Branching directed graph.** Fan-out and merge are supported by the model; the first milestone
  simply draws a straight line.
- **Export is a sink node**, not a hidden app action. The graph may contain multiple sinks; the
  first milestone uses one.

### Authoring vs. storage (two layers)

- Authoring happens through the fluent builder or the editor. Both **compile down to a plain,
  decoupled graph definition**: a list of nodes (each with an id, its operation type, and its
  settings) and a list of edges. The graph definition is the thing that is saved, loaded, and run —
  keeping authoring ergonomics separate from the wire format.

### The runtime-spine contracts (proposed shapes)

Concrete shapes for the three contracts every later slice inherits from the runtime spine (issue
01): the **operation registry**, the **graph definition**, and the **per-format capability set**.
These are a proposed starting point — the implementing agent may refine names and types, but should
preserve the *roles* and the containment boundary (orchestration never sees inside an asset). This
mirrors the "shape-only" spirit of the illustrative authoring snippet below: it anchors the API so
the spine doesn't invent an awkward one, not a frozen signature.

```ts
// ---- Shared vocabulary ----

/** A format that can flow along a wire. glTF only in milestone 1; the union grows later. */
type AssetFormat = "gltf" | "usd" | "image";

/** A whole-asset payload on a wire. OPAQUE to orchestration (containment): only the per-format
 *  capabilities and operation bodies know what `payload` is — for "gltf" it is a gltf-transform
 *  Document. The runtime never reaches inside `payload`. */
type Asset = { readonly format: AssetFormat; readonly payload: unknown };

/** Whether an operation edits content or compresses. Drives "compression comes last". */
type Phase = "content" | "compression";

/** A named, typed input on a node. */
type PortDef = { readonly name: string; readonly format: AssetFormat };

// ---- 1. Operation registry (the single source of truth) ----

/** What an operation emits: another asset, or the final serialized bytes (a sink). */
type OperationOutput =
    | { readonly kind: "asset"; readonly format: AssetFormat }
    | { readonly kind: "bytes" };

type OperationRunContext<TSettings> = {
    /** Upstream assets already resolved, keyed by this operation's input port name. */
    readonly inputs: ReadonlyMap<string, Asset>;
    readonly settings: TSettings;
};

/** A registry entry. Functional — no class per operation.
 *  - A SOURCE has `inputs: []` and reads its bytes from `settings` (e.g. a File/URL/Uint8Array).
 *  - A SINK has `output: { kind: "bytes" }`; its `run` returns the deliverable Uint8Array.
 *  - Everything else returns an `Asset`. */
type OperationDefinition<TSettings = Record<string, unknown>> = {
    readonly id: string;                  // stable type id, e.g. "importGltf"
    readonly label: string;               // palette label
    readonly inputs: readonly PortDef[];
    readonly output: OperationOutput;
    readonly phase?: Phase;               // defaults to "content"
    readonly defaultSettings: TSettings;
    readonly run: (ctx: OperationRunContext<TSettings>) => Promise<Asset | Uint8Array>;
};

type OperationRegistry = {
    register: <TSettings>(def: OperationDefinition<TSettings>) => void;
    get: (operationId: string) => OperationDefinition | undefined;
    list: () => readonly OperationDefinition[];   // drives the editor palette
};

// ---- 2. Graph definition (the saved, decoupled recipe) ----

/** A placed instance of an operation. `settings` are merged over the op's `defaultSettings`. */
type GraphNode = {
    readonly id: string;
    readonly operationId: string;
    readonly settings: Record<string, unknown>;
};

/** A typed connection: one node's single (whole-asset) output → a named input port on another. */
type GraphEdge = { readonly from: string; readonly to: string; readonly toPort: string };

type GraphDefinition = {
    readonly version: number;             // schema version, for save/load migration
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
};

// ---- 3. Per-format capability set (the ONLY gltf-transform touch-point in the spine) ----

/** Everything orchestration needs to handle one format without knowing its internals. Swapping
 *  gltf-transform later = reimplement this for "gltf"; the runtime/registry/graph stay untouched. */
type FormatCapabilities = {
    readonly format: AssetFormat;
    readonly deserialize: (bytes: Uint8Array) => Promise<Asset>;   // bytes → asset (import)
    readonly serialize: (asset: Asset) => Promise<Uint8Array>;     // asset → bytes (Draco encodes HERE, at write-time)
    readonly clone: (asset: Asset) => Asset;                       // deep copy for fan-out (gltf: cloneDocument(src), NOT document.clone())
};
```

### Execution and live preview

- **The preview runs the real pipeline, no approximation.** A rebuild executes the whole graph,
  writes the actual output glTF (which is when Draco and KTX2 actually encode), then loads those
  written bytes back through Babylon's glTF loader into a viewport. The editor therefore hosts a
  Babylon engine, scene, and glTF loader. This guarantees the preview equals the deliverable and
  verifies the output loads.
- **Rebuilds are debounced (~10s)** after the last change; **an in-flight rebuild is superseded**
  when another change lands (cancellation at the orchestration level — ignore stale results); and
  **preview state is clearly indicated** (waiting / rebuilding / done / errored).
- **Per-node memoization.** Each node caches its result keyed on its settings plus the state of
  everything upstream, so editing one node only re-runs that node and its downstream.
- **Any-node preview.** The graph can be evaluated up to a selected node to view an intermediate
  result, not just the final export.

### Enforcing "compression comes last"

- **Format and phase are orthogonal.** Wires are typed by format only. Whether an operation is a
  content edit or a compression step is a separate **phase** tag on the operation definition.
- **"Compression last" is a build-time validation rule**, not a wire type. If a content-editing
  operation consumes the output of a compression step, the tool warns. This keeps format
  compatibility clean and doesn't fight the four use cases.

### The abstraction over gltf-transform — containment, so gltf-transform is swappable

- **The orchestration layer stays gltf-transform-free.** The runtime, the operation registry, the
  graph definition, and the editor never reference gltf-transform types — they treat the asset as an
  opaque glTF-format payload. gltf-transform is confined to the operation implementations plus a
  small set of per-format glTF capabilities (read bytes → asset, asset → bytes, and
  clone-for-fan-out). The point of the discipline is that gltf-transform could be replaced by an
  in-house glTF backend later by rewriting those operation bodies and capabilities, without touching
  the orchestration layer. This is a containment discipline, **not** a formal pluggable-backend
  interface — for a PoC we don't build a speculative abstraction until there's a second backend to
  design against.
- **An operation's `run` may use any engine.** gltf-transform is just the default engine for glTF
  work; an operation is free to reach for another engine and write its results back through the
  asset. Draco uses gltf-transform directly; KTX2 uses a separate Basis encoder because
  gltf-transform can't encode KTX2 in the browser. The encoder is incidental — one engine a single
  operation happens to use — not an architectural seam of its own.
- **Heavy libraries load on demand** via dynamic import (the same pattern Inspector V2 uses for
  Havok), so gltf-transform and the WASM encoders don't bloat the base bundle.

### KTX2 in the browser (reuse the existing prototype)

- The KTX2 node reuses the browser Basis→KTX2 encoder already prototyped for Babylon (the
  `basisu-encoder` branch). It wraps Binomial's `basis_universal` encoder WASM served from the
  Babylon CDN (the same pattern as the existing Draco encoder), runs in a worker pool with a
  main-thread fallback, and emits a KTX2 container directly — exactly the payload a glTF's
  `KHR_texture_basisu` extension needs. It uses ETC1S for color data and UASTC for non-color data.
- The prototype's public entry point takes a Babylon texture, but the pipeline holds raw image
  bytes, so we **expose a raw-pixels entry point** (the underlying function already exists
  internally) and feed it decoded RGBA from the document's textures. The KTX2 node, per texture:
  reads the image, decodes it to RGBA + dimensions, enforces the encoder's constraints, encodes to
  KTX2, then writes the result back onto the texture and declares the `KHR_texture_basisu`
  extension on the document.
- **Constraints inherited from the prototype:** texture dimensions must be multiples of 4,
  standard dynamic range only, and no cube maps.

### Verified technical facts that shaped the above

- **Draco encodes at write time**, in the browser, via WASM. A Draco node just tags the document
  (and welds geometry internally); the actual encode happens when the output is written — so
  "Draco always last" is simply how the library works.
- **gltf-transform cannot encode KTX2 in the browser** (its only KTX2 path shells out to an
  external CLI tool through Node; its in-transform texture compression only does jpeg/png/webp/
  avif). Hence the separate browser encoder.
- **Safe fan-out requires cloning.** Transforming a document mutates it in place, and the library's
  own `clone()` is disabled in favor of a document-clone helper. Each mutating node clones its
  input first, which is what makes branching safe.

### The editor UI

- A **fresh editor built on Fluent** (the same component library and style as Inspector V2). It
  keeps the familiar bones — a canvas of nodes with ports and wires, a node-list/palette panel, and
  a properties panel — but is rebuilt from scratch rather than reusing the legacy node-editor
  framework and its opinions.

### Packaging and naming

- A new dev package published as `@babylonjs/node-assets`, modeled on the existing `lottiePlayer`
  package, holds the operation registry, the operation definitions, the runtime, and graph
  serialization. It depends on `@babylonjs/core` and gltf-transform. The Basis/KTX2 encoder is
  vendored into this package for the PoC so we aren't blocked on landing it in core.
- A new tool package is the Fluent editor, which also hosts the Babylon viewport for the live
  preview.
- **Naming convention:** the authoring class/concept is **`NodeAsset`** (singular, mirroring
  `NodeMaterial` — "a node-defined asset"); the product is spoken of as "NodeAssets" and the editor
  is the "Node Assets Editor." The singular-class / plural-product split is intentional.

### Illustrative authoring shape (shape-only, not the real API)

> This is not a proposed API. It exists only to convey the *feel* of the authoring surface — a
> fluent chain where each call adds a node and returns a handle, branches are captured in
> variables, and merges take another handle as an argument. Names, signatures, and settings are
> placeholders and will be designed for real later.

```ts
const asset = new NodeAsset();
const gltf = asset.importGltf({ url: "chair.glb" });          // source
const logo = asset.importImage({ url: "logo.png" });          // second source (compose)
gltf.applyTexture(logo, { slot: "baseColor" })                // multi-input node
    .draco({ method: "edgebreaker" })                         // compression (phase: compress)
    .ktx2({ format: "UASTC" })                                // compression (phase: compress)
    .exportGltf({ filename: "chair.glb" });                   // sink
```

Every call corresponds to one entry in the operation registry; the editor's palette and the saved
graph definition both fall out of those same entries.

## Testing Decisions

**What makes a good test here:** assert external behavior, not implementation details. For this
feature that means: given a graph definition, running it produces an output glTF with the expected
structure (e.g. the `KHR_draco_mesh_compression` and `KHR_texture_basisu` extensions present) and
that output loads back through the Babylon glTF loader. Tests should not assert on internal
call sequences, private helpers, or memoization internals.

Two test seams, each at the highest point of its own execution environment (confirmed with the
user):

- **Primary seam — the runtime's graph-runner, tested headless.** One function boundary:
  `graph definition → output glTF`. A single seam here covers the overwhelming majority of behavior:
  operation-registry resolution, topological execution order, multi-input merge, clone/fan-out
  safety, "compression last" phase validation, and builder ↔ graph-definition serialization
  round-trips. gltf-transform is pure JS and runs headless, so the Draco path is exercised for real.
  The KTX2/Basis encoder is the one browser-oriented dependency (WASM + a CDN script load; its worker
  pool already falls back to the main thread when workers are absent), so how the headless seam
  handles that encoder — the real vendored encoder vs. a substitute — is left to the encoder slice to
  settle empirically rather than prescribed here. These tests assert the pipeline attaches the right
  extensions and produces the right asset. Prior art: the existing vitest unit tests in the
  `lottiePlayer` dev package.
- **Secondary seam — the live-preview round-trip, tested in a browser.** One thin test that runs a
  small real pipeline with the *actual* Draco and KTX2 WASM encoders in-browser, exports, re-imports
  through Babylon's glTF loader into a viewport, and asserts the compressed result renders/loads.
  This is unavoidably browser-based (real WASM + the loader + a viewport) and is the only thing
  that proves the encoders and the preview actually work end-to-end. Prior art: the repo's existing
  Playwright visualization tests and the devhost validation flow.

Modules tested: the runtime/registry/serialization module via the primary seam; the encoder +
preview round-trip via the secondary seam. The editor UI beyond the preview round-trip is not a
primary test target for the PoC.

## Out of Scope

- **Full OpenUSD** — composition, layering, Hydra, and authoring back to USD. USD is a future
  *input* via a conversion node; none of the deep USD machinery is in scope.
- **USD and image inputs in the first milestone.** The model supports them (typed wires,
  multi-input ports, conversion nodes), but the first milestone builds glTF-in / glTF-out only.
- **The code API (functional fluent builder) in the first milestone.** The builder (stories
  19–25) stays in the PoC vision, but is deferred out of the first milestone — the runtime already
  provides a programmatic path (run a graph definition directly), and the builder is pure authoring
  sugar over the same registry, so it can land later without walling off any other work.
- **Customizing and composing operations in the first milestone** (metadata, material reassignment,
  LOD generation, asset merging, external-image texturing). Designed for, not built yet.
- **A Node/cloud backend and heavy server-side operations** (Simplygon-class). The run layer stays
  backend-agnostic so this can be added later without redesign, but it isn't built.
- **Non-glTF outputs.** Output is glTF only.
- **Reusing the legacy Node Editor framework** (the shared node-graph-system ledger framework). The
  editor is rebuilt on Fluent.
- **Landing the Basis/KTX2 encoder in `@babylonjs/core`.** For the PoC it's vendored into the
  NodeAssets package; upstreaming (including exposing a public raw-pixels entry point from core) is
  deferred.
- **Deep internal-architecture commitments** beyond the decisions above. Per the PoC brief, keep it
  black-box and defer where possible.

## Further Notes

### Glossary

The NodeAssets glossary lives in its own `CONTEXT.md` — the repo's domain-vocabulary convention (see
`docs/agents/domain.md`) — not inline here, so the vocabulary outlives this point-in-time PRD and is
what future agents read for terminology. While NodeAssets is design-only it sits at
`.scratch/node-assets/CONTEXT.md`; issue 01 promotes it to `packages/dev/nodeAssets/CONTEXT.md` and
registers it in a root `CONTEXT-MAP.md`. Use those terms (NodeAsset, operation, node, port,
wire / edge, asset, file type, phase, source, sink, capability, graph definition) in the issues.

### Origin and framing

- Inspired by the Babylon team's old "Polymorph" concept and the "messy middle" framing. This PRD
  scopes a proof of concept, deliberately far smaller than that vision.
- The illustrative authoring snippet above is **shape-only** and must not be treated as the
  proposed API.

### Prototype to reuse

- The KTX2 node builds on Alex's existing browser Basis→KTX2 encoder prototype (the `basisu-encoder`
  branch), which is Babylon-idiomatic (CDN-hosted WASM, worker pool, main-thread fallback) and
  emits KTX2 directly. Reusing it removes the last major technical risk in the all-browser plan.

### Next step

Split this PRD into independently-grabbable, tracer-bullet issues (via `/to-issues`). Get Alex's go
before any code is written.
