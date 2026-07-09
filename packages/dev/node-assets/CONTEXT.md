# NodeAssets (runtime)

The `@babylonjs/node-assets` runtime: a small, node-based content pipeline. A `NodeAsset` is a graph
of **blocks** that takes a source asset in and produces a Babylon-ready asset out, with gltf-transform
doing the read/write underneath. The vocabulary deliberately mirrors Babylon's existing node systems
(`NodeMaterial`, `SmartFilters`, `FlowGraph`) so it feels native. The editor's visual counterparts of
these terms live in `packages/tools/nodeAssetsEditor/CONTEXT.md`.

> **Scope note.** The entries below are the ubiquitous language across milestones 01–06. Milestone 01
> (scaffolding: glTF roundtrip + Draco/KTX2) is built; terms introduced by the 02–06 slice PRDs
> (SCENE spine, scalar payload kinds, selector/pointer, image lane, composition) are the agreed
> vocabulary for that work and may not all be implemented yet. See `.scratch/0N-*/PRD.md`.

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
kinds are **SCENE** (the spine; a gltf-transform `Document`), **IMAGE**, **BYTES**, **NUMBER**,
**STRING**, and **JSON**. `SCENE` is the milestone-02 rename of the original `GLTF` value: the payload
is unchanged, the name now states that it is the normalized spine, not a file format. _Avoid_: format,
capability, wrapper class.

**SCENE spine**:
The single normalized in-graph representation every 3D format funnels through — the gltf-transform
`Document`. Format lives only at the import/export boundary; every middle block is format-agnostic and
sees only a SCENE. _Avoid_: IR, neutral format, scene graph (the runtime's, at least).

**transcoder**:
The logic inside a source (import) block that turns a foreign format (USD, and later FBX/OBJ/…) into a
SCENE `Document`. Inherently a lossy funnel — what glTF can't express is approximated, dropped, or
stashed under `extras`. _Avoid_: converter (too generic), loader (that is the glTF boundary block).

**selector / pointer**:
A **glTF Object Model JSON Pointer** (the Khronos standard used by `KHR_animation_pointer` /
`KHR_interactivity` and FlowGraph) that addresses one property in a SCENE — e.g.
`/nodes/0/translation`, `/materials/2/pbrMetallicRoughness/baseColorFactor`. Single-target and
index-based for now; wildcards/queries are a later, additive extension. _Avoid_: path, query (until
multi-target exists), XPath.

**property accessor**:
The `get` / `getTarget` / `set` / `type` handle a pointer resolves to, produced by NAE's own
path→accessor converter over the gltf-transform `Document` (the analog of the glTF loader's
`GLTFPathToObjectConverter` / `IObjectAccessor`, but targeting gltf-transform properties rather than
Babylon scene objects). _Avoid_: getter/setter, binding.

**evaluate-once / copy-on-fan-out**:
The DAG-correctness rules (milestone 05). Each block is evaluated a single time per `buildAsync()`
(evaluate-once); when a SCENE output feeds more than one consumer, each consumer gets an independent
`Document` clone (copy-on-fan-out) so in-place mutations don't stomp across branches. Scalar payloads
are shared, not cloned. _Avoid_: memoization cache (as a user term), COW.

## Blocks

**ImportGLTFBlock / ExportGLTFBlock**:
The glTF boundary blocks. Import turns source `.glb`/`.gltf` bytes into a SCENE; Export consumes a
SCENE and produces the deliverable glb bytes. _Avoid_: loader/saver, reader/writer.

**ImportUSDBlock**:
A source block that transcodes USD (`.usd`/`.usda`/`.usdz`) onto the SCENE spine via a WebAssembly
build of tinyusdz. The first non-glTF entry point. _Avoid_: USD loader, USD reader.

**ImportImageBlock / ExportImageBlock**:
The IMAGE boundary blocks. Import turns source image bytes into an IMAGE payload; Export produces
deliverable image bytes. `ExportImageBlock` is a terminal export block alongside `ExportGLTFBlock`.
_Avoid_: image loader/saver.

**operator block**:
A family of SCENE→SCENE middle blocks wrapping `@gltf-transform/functions` operations — dedup, prune,
weld, quantize, simplify, flatten, join, and friends. One block per operation. _Avoid_: transform
(the editor/scene word), filter, modifier.

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
The generic selector triad's operations. GetProperty reads the value at a pointer out of a SCENE
(output JSON); SetProperty writes a value at a pointer into a SCENE (output SCENE). Together they
subsume set-extras, placement, and (typed for IMAGE) texture extraction. _Avoid_: read/write node,
mutate.

**MergeScenes**:
A composition block folding N SCENE inputs into one SCENE (wrapping gltf-transform's document merge),
preserving each source's hierarchy under the combined roots so per-source pointers stay addressable.
_Avoid_: combine, union, join (that is an operator block).

**ExtractTexture / SetTexture**:
The IMAGE-typed members of the selector family. ExtractTexture resolves a texture-slot pointer and
outputs the texture as an IMAGE; SetTexture writes an IMAGE into a texture slot. Same converter as
GetProperty/SetProperty, different port kind. _Avoid_: get/put texture, texture IO.

**BuildPBRMaterial**:
A block that assembles a PBR metallic-roughness material from IMAGE inputs (base colour, normal,
metallic-roughness, emissive) and factor params, attaches it to a SCENE, and optionally assigns it at
a target pointer. The "compose up the funnel" tool. _Avoid_: material factory, shader block.

**gltf-transform Document**:
The payload that flows along a `SCENE` connection — a gltf-transform `Document`, used directly, no
wrapper. It *is* the SCENE spine. gltf-transform lives only inside the block bodies. _Avoid_: asset,
model, scene, glTF (as the payload's name).
