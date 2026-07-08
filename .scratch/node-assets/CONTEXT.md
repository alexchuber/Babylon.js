# Node Assets

NodeAssets is a small, node-based content pipeline for Babylon.js: a graph of **blocks** that takes a
source asset in and produces a Babylon-ready asset out. The MVP does exactly one thing — import a
glTF and export it back out — with gltf-transform doing the read/write underneath. A companion Fluent
node editor authors these graphs.

The vocabulary **deliberately mirrors Babylon's existing node systems** (`NodeMaterial`,
`SmartFilters`, `FlowGraph`) so it feels native. The singular class `NodeAsset` mirrors
`NodeMaterial` / `SmartFilter`; the product is spoken of as "NodeAssets"; the tool is the "Node Assets
Editor".

## Language

**NodeAsset**:
The graph object — one node-defined asset pipeline. Mirrors `SmartFilter` / `NodeMaterial`.
`buildAsync()` runs it and returns the exported bytes.

**block**:
A node in the graph. Base class `NodeAssetBlock` (mirrors `BaseBlock` / `NodeMaterialBlock`). Not a
Babylon scene-graph `Node`.

**connection point**:
A typed input or output on a block (mirrors `ConnectionPoint` / `NodeMaterialConnectionPoint`), with a
`direction` and a `type`. The editor draws it as a port.

**connection**:
A link from one block's output connection point to another block's input connection point
(`connectTo`, `connectedPoint`). The editor draws it as a wire.

**ImportGLTFBlock / ExportGLTFBlock**:
The boundary blocks. Import has no inputs and produces a glTF; Export consumes a glTF and produces the
deliverable bytes.

**gltf-transform Document**:
The payload that flows along a glTF connection — used **directly**, no wrapper. gltf-transform is the
one library the glTF blocks lean on; keep it inside the block bodies.

---

_Removed as premature for a PoC (do not reintroduce without a real need): operation registry, per-format adapters, transcoders, an abstraction/view over asset/format, a separate "graph definition" layer, per-node memoization. The graph is linear and uses gltf-transform directly._
