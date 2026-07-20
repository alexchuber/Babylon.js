# NodeAssets

The `@babylonjs/node-assets` runtime defines typed asset-processing graphs. Supported source formats
funnel into Universal for reusable content optimization, then exit through glTF to produce GLB.

## Language

### Graph model

**NodeAsset**:
The graph object that owns blocks and builds one terminal GLB result.
_Avoid_: pipeline (as the object's name), scene, model

**block**:
One typed processing decision in a NodeAsset, with connection points forming its public graph surface.
_Avoid_: node (the editor's visual term), component, step

**primitive block**:
A block representing one independently orderable user decision.
_Avoid_: internal block, leaf block, simple block

**aggregate block**:
A block whose behavior is a typed subgraph of primitive blocks behind one public set of connection
points.
_Avoid_: mega-block, implicit conversion, macro (except informally)

**custom aggregate block**:
An aggregate whose internal subgraph belongs to the authored graph rather than a built-in definition.
_Avoid_: custom block, frame, copied aggregate

**connection point**:
A typed input or output on a block.
_Avoid_: port (the editor's visual term), socket, pin

**connection**:
A typed data-flow relationship from one output connection point to one input connection point.
_Avoid_: wire (the editor's visual term), edge, link

**connection point type**:
The exact kind of value a connection point accepts or emits; different kinds require an explicit
transcoder.
_Avoid_: union type, compatible-enough type, implicit cast

**build**:
Evaluation of the connected blocks needed to produce the terminal GLB.
_Avoid_: compile, render, preview

### Asset flow

**source payload**:
A typed glTF, USD, Babylon, or Node Geometry value produced by a Read block. A source payload is only
guaranteed to support its matching Universal transcoder unless its format lane defines other blocks.
_Avoid_: faithful native representation, Universal value, file

**Universal**:
The shared working representation where source-independent content optimization occurs.
_Avoid_: Document, glTF Document, SCENE, scene spine, universal format file

**scene**:
The complete 3D asset content operated on by scene-wide Universal blocks such as Transform Scene,
Center Scene, and Merge Scenes.
_Avoid_: Babylon Scene (unless referring specifically to a Babylon source payload), graph

**format lane**:
A typed source- or target-specific graph segment outside Universal. The proof of concept provides a
glTF delivery lane; USD, Babylon, and Node Geometry only funnel into Universal.
_Avoid_: domain, branch, implicit conversion path

**Read block**:
A primitive source boundary that resolves a URL, snippet, or uploaded file into one typed source
payload.
_Avoid_: Import block, loader, source operator

**transcoder**:
A primitive block that explicitly crosses between a source payload and Universal, or from Universal
to glTF. The supported crossings are glTF, USD, Babylon, and Node Geometry into Universal, plus
Universal into glTF.
_Avoid_: converter, adapter, automatic cast, pairwise transcoder

**Import block**:
A built-in aggregate combining one Read block with its matching source-to-Universal transcoder.
_Avoid_: Read block, loader, source primitive

**Write glTF**:
The primitive output boundary that turns a glTF payload into the terminal GLB.
_Avoid_: Export glTF, serializer node, save block

**Export glTF**:
The built-in aggregate combining Universal-to-glTF transcoding with Write glTF.
_Avoid_: Write glTF, implicit exporter, output primitive

**LossRecord**:
A build result describing content approximated or dropped while crossing a transcoder.
_Avoid_: build error, validation issue, console warning

### Processing

**Universal operator**:
A Universal-to-Universal block that performs reusable content cleanup, reduction, restructuring,
attribute work, or texture resizing.
_Avoid_: glTF operator, format-specific transform

**glTF operator**:
A glTF-to-glTF block that performs delivery-format work after Universal optimization.
_Avoid_: Universal operator, exporter option

**Deduplicate Resources**:
The built-in aggregate for common resource deduplication, composed from material, texture, mesh-reuse,
and shared-data primitives.
_Avoid_: Dedup, Detect Instances, one property-type block

**Compress Geometry (Draco)**:
The glTF operator that applies Draco geometry compression for delivery.
_Avoid_: Apply Draco, Universal compression

**Compress Textures (KTX2)**:
The glTF operator that encodes delivery textures in KTX2 using Basis Universal modes.
_Avoid_: Apply BasisU, Universal texture resize
