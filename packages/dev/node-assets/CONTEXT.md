# NodeAssets (runtime)

The `@babylonjs/node-assets` runtime: a small, node-based content pipeline. A `NodeAsset` is a graph
of **blocks** that takes a source asset in and produces a Babylon-ready asset out, with gltf-transform
doing the read/write underneath. The vocabulary deliberately mirrors Babylon's existing node systems
(`NodeMaterial`, `SmartFilters`, `FlowGraph`) so it feels native. The editor's visual counterparts of
these terms live in `packages/tools/nodeAssetsEditor/CONTEXT.md`.

> **Scope note.** The entries below are the ubiquitous language across milestones 01–07. Milestones
> 01–06 (glTF roundtrip + Draco/KTX2, the single SCENE spine, scalar payloads, selector/pointer, image
> lane, composition) are built or specified against the single-spine model. Milestone 07 replaces the
> single spine with **three first-class 3D representations** (glTF / USD / Babylon) connected by
> explicit **transcoders**, with glTF as the only export terminal (see `docs/adr/0004`–`0006` and
> `.scratch/07-scene-representation-platform/`). Terms tagged _(milestone 07)_ below are that agreed
> vocabulary and may not all be implemented yet. `SCENE` survives only as a deprecated alias for the
> glTF representation.

## Language

**NodeAsset**:
The graph object — one node-defined asset pipeline. Mirrors `SmartFilter` / `NodeMaterial`.
`buildAsync()` pull-evaluates it from the terminal export block and returns the exported bytes.
_Avoid_: pipeline, graph (as the object's name), scene.

**block** (`NodeAssetBlock`):
A single processing step in the graph, owning input and output connection points. Base class
`NodeAssetBlock` (mirrors `BaseBlock` / `NodeMaterialBlock`). Not a Babylon scene-graph `Node`.
_Avoid_: node (that is the editor's word), operation, step, transform.

**connection point** (`NodeAssetConnectionPoint`):
A typed input or output on a block, with a `direction` and a `type`. The editor renders it as a port.
_Avoid_: port (editor's word), slot, socket, pin.

**connection**:
A link from one block's output connection point to another block's input connection point
(`connectTo`, `connectedPoint`). The editor renders it as a wire. _Avoid_: wire (editor's word), edge,
link.

**connection point type** (`NodeAssetConnectionPointType`):
The payload kind a connection point carries — a flat enum, kind-equality checked at `connectTo`. The
milestone 01–06 kinds are **SCENE** (a gltf-transform `Document`), **IMAGE**, **NUMBER**, **STRING**,
and **JSON**. Milestone 07 adds the three first-class 3D **representation** kinds — **GLTF_DOCUMENT**,
**USD_STAGE**, **BABYLON_SCENE** — and demotes **SCENE** to a deprecated source alias for
`GLTF_DOCUMENT`. The enum stays flat and kind-equality-checked; what changes is that the three
representation kinds carry **typed payload wrappers** (below) rather than a bare interpreted value.
_Avoid_: format, capability, wrapper class (as the enum's shape), common scene supertype.

**representation** _(milestone 07)_:
One of the **three first-class in-graph 3D payloads**, with **no common supertype**: **GLTF_DOCUMENT**,
**USD_STAGE**, **BABYLON_SCENE**. A representation is distinct from a **resource** (`IMAGE`,
`NODE_GEOMETRY`) and a **value** (`NUMBER`/`STRING`/`JSON`). Conversion between representations happens
only through explicit named **transcoders**; glTF is the only one that can be exported. _Avoid_: spine,
IR, neutral format, scene supertype.

**GltfAsset / UsdAsset / BabylonAsset** _(milestone 07)_:
The typed payload wrappers behind the three representation kinds. **GltfAsset** wraps a gltf-transform
`Document` (value-like: cloned on fan-out). **UsdAsset** wraps a frozen, dependency-free
`IResolvedStage` plus an immutable Node Assets **overlay** (shared on fan-out; edits are overlays).
**BabylonAsset** owns a live `NullEngine` + `Scene` for the build (**affine**: never implicitly cloned;
duplicating it is an explicit lossy fork). Their lifecycle is owned by the **build scope**, not the
blocks. _Avoid_: handle, box, variant.

**SCENE spine** _(historical; retired in milestone 07)_:
The milestone 01–06 model: a single normalized in-graph representation every 3D format funnelled
through — the gltf-transform `Document`. Milestone 07 **retires the spine** in favour of three
first-class **representations** with no shared supertype; format no longer collapses to glTF on import.
The word is kept only to explain older graphs and the deprecated `SCENE` alias. _Avoid_ using it for
new work: say **representation** (or the specific kind) instead.

**import block** _(milestone 07 vocabulary)_:
A source block (**0 representation inputs, 1 representation output**) that turns foreign **bytes → one
representation** (e.g. `ImportGLTF` → GLTF_DOCUMENT, `ImportUSD` → USD_STAGE). The bytes→representation
boundary; format lives only here and at export. _Avoid_: loader (reserve for the glTF boundary block),
reader, decoder, transcoder (that is mid-graph, no bytes).

**transcoder** _(redefined in milestone 07)_:
A **mid-graph** block (**1 representation input, 1 representation output, no bytes**) that converts **one
representation → another representation**. v1 ships four explicit, named transcoders and no others:
**USD2glTF** (USD_STAGE → GLTF_DOCUMENT, a direct resolved-stage→`Document` mapper, not routed through
Babylon), **USD2Babylon** (USD_STAGE → BABYLON_SCENE, via the USD loader's `AdaptResolvedStageToScene`),
**glTF2Babylon** (GLTF_DOCUMENT → BABYLON_SCENE, via the mature glTF 2.0 loader), and **Babylon2glTF**
(BABYLON_SCENE → GLTF_DOCUMENT, via the glTF serializer). Every transcoder is a lossy funnel and reports
what it dropped as a **LossRecord**. There is no implicit conversion, generic representation wire,
union/`Switch`, mandatory hub, or path planner in v1. _Avoid_: converter (too generic), adapter (that is
the USD loader's internal step), import block (that is bytes→representation, 0-in/1-out).

**build scope** _(milestone 07)_:
The per-`buildAsync()` owner of representation lifecycle: typed values, cancellation / fail-fast abort,
resource and time limits, `allSettled` sibling cleanup, a lifetime ledger and disposal, large-input
transferables, diagnostics, and affine Babylon fan-out. Blocks produce typed payloads registered with
the scope; the scope disposes them. _Avoid_: context (overloaded), session, pool.

**LossRecord** _(milestone 07)_:
A build-scoped diagnostic describing what a transcoder (or import block) approximated or dropped — a
refinement of the USD loader's `IResolvedDiagnostic` shape (`severity` / `message` / optional `path`).
Surfaced to the user rather than hidden. _Avoid_: warning list, error (fatals throw instead).

**selection** _(milestone 07; supersedes the bare pointer)_:
A **domain-owned, versioned**, **first-class capturable wire value** addressing one representation,
carrying **owner** (glTF / USD / Babylon), **version** (payload revision), **target kind**,
**cardinality** (single vs multi), and **addresses**. It **routes / fans out within its owner domain** and
is **rejected cross-domain**. A mutator that restructures a representation **remaps or invalidates** the
selections it affects. The glTF domain's addresses are glTF Object Model JSON Pointers (below); USD's are
prim / property paths resolved as immutable overlay selectors. Only the TypeScript encoding is
implementation-owned. _Avoid_: pointer (that is only glTF's address form), query (until multi-target),
binding.

**selector / pointer**:
A **glTF Object Model JSON Pointer** (the Khronos standard used by `KHR_animation_pointer` /
`KHR_interactivity` and FlowGraph) that addresses one property in a **glTF representation** — e.g.
`/nodes/0/translation`, `/materials/2/pbrMetallicRoughness/baseColorFactor`. _(Milestone 07)_ this is
the **glTF domain's** address form for a **selection**, not a universal selector; USD uses prim/property
paths as immutable overlay selectors. Single-target and index-based for now; wildcards/queries are a
later, additive extension. _Avoid_: path, query (until multi-target exists), XPath.

**property accessor**:
The `get` / `getTarget` / `set` / `type` handle a pointer resolves to, produced by NAE's own
path→accessor converter over the gltf-transform `Document` (the analog of the glTF loader's
`GLTFPathToObjectConverter` / `IObjectAccessor`, but targeting gltf-transform properties rather than
Babylon scene objects). _Avoid_: getter/setter, binding.

**evaluate-once / copy-on-fan-out**:
The DAG-correctness rules. Each block is evaluated a single time per `buildAsync()` (evaluate-once);
when an output feeds more than one consumer, fan-out policy is **per payload kind** _(milestone 07)_:
**GltfAsset** is value-like (clone the `Document`, as milestones 01–06 did for `SCENE`); **UsdAsset** is
immutable (share the frozen stage; overlays are additive); **BabylonAsset** is **affine** (no implicit
clone — an explicit lossy fork block); resources and scalars are shared. _Avoid_: memoization cache (as
a user term), COW. Evaluation rejects cycles against the current ancestry without rejecting valid
fan-out.

**Evaluate / Bake** _(milestone 07; NodeGeometry)_:
`NODE_GEOMETRY` imports **unevaluated** as a **NodeGeometryAsset** (a resource wrapper owning a parsed,
unevaluated graph). An explicit **Evaluate** runs the procedural graph and adds a **frozen `VertexData`
snapshot** to that same asset (both states coexist — it does **not** collapse into a `BabylonAsset`); a
**Bake** is the separate step that turns the evaluated result into a Babylon representation. On fan-out a
NodeGeometryAsset is cloned via **serialize / no-build parse** (its own copy category). Selections over
NodeGeometry only resolve after Evaluate. _Avoid_: run, compile, generate (informally fine), realize.

**handedness** _(milestone 07)_:
Babylon's coordinate mode is dynamic and **preserved**, exposed via `scene.useRightHandedSystem`. USD
and glTF adapters may create **right-handed** Babylon scenes without per-vertex/index flips (matching the
USD loader, which sets `scene.useRightHandedSystem = true` and rotates only for up-axis); a `.babylon`
representation preserves its authored mode. Three boundaries are kept **distinct**: the `BabylonAsset.scene`
representation contract, the loader/root behavior, and the terminal GLB **Viewer preview** boundary (where
the preview may convert coordinates independently of the payload). Representation handedness is never
inferred from preview rendering; the editor/manifest surface each boundary's mode. _Avoid_: chirality,
winding (a mesh-level detail), flip (as the whole concept).

**build error** (`NodeAssetBuildError`):
An actionable build failure carrying the responsible block's stable id and, when relevant, its input
name. Missing required inputs, cycles, and block execution failures use this type so editor hosts can
localize the problem while generic callers can continue treating it as an `Error`. _Avoid_: diagnostic
(the editor's visual state), validation error (reserved for glTF validation).

## Blocks

**ImportGLTFBlock / ExportGLTFBlock**:
The glTF boundary blocks. Import turns source `.glb`/`.gltf` bytes into a **GLTF_DOCUMENT** (the glTF
representation; `SCENE` is the legacy alias); Export consumes a GLTF_DOCUMENT and produces the
deliverable glb bytes. _Avoid_: loader/saver, reader/writer.

**ImportUSDBlock**:
A source block that imports USD (`.usd`/`.usda`/`.usdz`). _(Milestone 07)_ new USD graphs use the
dependency-free USD **loader** (`ResolveUsdStageAsync` → `IResolvedStage`) to import to a **USD_STAGE**
representation (`UsdAsset`); the original tinyusdz-WebAssembly transcoder that funnelled USD straight
onto the glTF spine is **hidden / deprecated, compatibility-only**. _Avoid_: USD loader (as this
block's name — the loader is the resolution layer it calls), USD reader.

**ImportImageBlock / ExportImageBlock**:
The IMAGE boundary blocks. Import turns source image bytes into an IMAGE payload; Export produces
deliverable image bytes. `ExportImageBlock` is a terminal export block alongside `ExportGLTFBlock`.
_Avoid_: image loader/saver.

**operator block**:
A family of **GLTF_DOCUMENT→GLTF_DOCUMENT** middle blocks wrapping `@gltf-transform/functions`
operations — dedup, prune, weld, quantize, simplify, flatten, join, and friends. One block per
operation. _Avoid_: transform (the editor/scene word), filter, modifier.

**DracoCompressionBlock**:
A middle block that tags the document for `KHR_draco_mesh_compression`; the actual geometry encode
happens when `ExportGLTFBlock` writes. _Avoid_: draco block, mesh compressor.

**KTX2CompressionBlock**:
A middle block that compresses the document's textures to KTX2 / Basis Universal
(`KHR_texture_basisu`) — ETC1S for color, UASTC for data textures. Unlike Draco, the encode runs
inside this block. _Avoid_: basis block, texture compressor.

**value literal** (`NumberLiteral` / `StringLiteral` / `JsonLiteral`):
Source blocks with no inputs and one scalar output — a constant NUMBER, STRING, or JSON to feed other
blocks' inputs (including a Selector's pointer). _Avoid_: constant node (fine informally), input node.

**Selector**:
A block that emits a pointer (as a STRING) naming the property later Get/Set blocks act on; the future
home of wildcard/query syntax. _Avoid_: query block (until multi-target), finder.

**GetProperty / SetProperty**:
The generic selector triad's operations. GetProperty reads the value at a pointer out of a
**GLTF_DOCUMENT** (output JSON); SetProperty writes a value at a pointer into a GLTF_DOCUMENT (output
GLTF_DOCUMENT). Together they subsume set-extras, placement, and (typed for IMAGE) texture extraction.
_Avoid_: read/write node, mutate.

**MergeScenes**:
A composition block folding N **GLTF_DOCUMENT** inputs into one GLTF_DOCUMENT (wrapping gltf-transform's
document merge), preserving each source's hierarchy under the combined roots so per-source pointers stay
addressable. _Avoid_: combine, union, join (that is an operator block).

**ExtractTexture / SetTexture**:
The IMAGE-typed members of the selector family. ExtractTexture resolves a texture-slot pointer and
outputs the texture as an IMAGE; SetTexture writes an IMAGE into a texture slot. Same converter as
GetProperty/SetProperty, different port kind. _Avoid_: get/put texture, texture IO.

**BuildPBRMaterial**:
A block that assembles a PBR metallic-roughness material from IMAGE inputs (base colour, normal,
metallic-roughness, emissive) and factor params, attaches it to a **GLTF_DOCUMENT**, and optionally
assigns it at a target pointer. The "compose up the funnel" tool. _Avoid_: material factory, shader block.

**gltf-transform Document**:
The payload wrapped by a **GltfAsset** (the `GLTF_DOCUMENT` representation) — a gltf-transform
`Document`, used directly, no re-wrapping inside block bodies. It was the milestone 01–06 `SCENE`
payload (`SCENE` is now a deprecated alias for `GLTF_DOCUMENT`). gltf-transform lives only inside the
block bodies. _Avoid_: asset (that is the wrapper's role), model, scene, glTF (as the payload's name).
