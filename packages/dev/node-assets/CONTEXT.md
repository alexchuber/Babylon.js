# NodeAssets (runtime)

The `@babylonjs/node-assets` runtime: a small, node-based content pipeline. A `NodeAsset` is a graph
of **blocks** that takes a source asset in and produces a Babylon-ready asset out, with gltf-transform
doing the read/write underneath. The vocabulary deliberately mirrors Babylon's existing node systems
(`NodeMaterial`, `SmartFilters`, `FlowGraph`) so it feels native. The editor's visual counterparts of
these terms live in `packages/tools/nodeAssetsEditor/CONTEXT.md`.

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
The payload kind a connection point carries. Today the only value is `GLTF`; the enum exists so more
types (USD, image) can be added later. _Avoid_: format, kind.

## Blocks

**ImportGLTFBlock / ExportGLTFBlock**:
The boundary blocks. Import has no inputs and turns source bytes into a glTF; Export consumes a glTF
and produces the deliverable glb bytes. _Avoid_: loader/saver, reader/writer.

**DracoCompressionBlock**:
A middle block that tags the document for `KHR_draco_mesh_compression`; the actual geometry encode
happens when `ExportGLTFBlock` writes. _Avoid_: draco block, mesh compressor.

**KTX2CompressionBlock**:
A middle block that compresses the document's textures to KTX2 / Basis Universal
(`KHR_texture_basisu`) — ETC1S for color, UASTC for data textures. Unlike Draco, the encode runs
inside this block. _Avoid_: basis block, texture compressor.

**gltf-transform Document**:
The payload that flows along a `GLTF` connection — a gltf-transform `Document`, used directly, no
wrapper. gltf-transform lives only inside the block bodies. _Avoid_: asset, model, scene, glTF (as the
payload's name).
