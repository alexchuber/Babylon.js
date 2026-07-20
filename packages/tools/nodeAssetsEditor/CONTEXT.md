# Node Assets Editor

The `@tools/node-assets-editor` tool: a fresh Fluent node editor (same component library and style as
Inspector V2) that authors and previews NodeAssets graphs. It has two layers — a **reusable node-graph
framework** that is deliberately domain-agnostic, and a **NodeAssets app** that binds that framework to
the `@babylonjs/node-assets` runtime. The runtime terms it visualizes live in
`packages/dev/node-assets/CONTEXT.md`; this glossary is the editor's own vocabulary.

> **Scope note.** Milestone 01 (the editor scaffolding) is built. Forward references below to image
> preview and the growing palette categories are the agreed vocabulary for the 02–06 slice PRDs and
> may not all be implemented yet. Terms tagged _(milestone 07)_ (the three representations, transcoder
> nodes, resource lanes, the gallery, diagnostics surfacing) are the agreed vocabulary for the
> scene-representation-platform work — see `.scratch/07-scene-representation-platform/` and
> `docs/adr/0004`–`0006`. See `.scratch/0N-*/PRD.md`.

## Language

**Node Assets Editor (NAE)**:
The tool itself — the whole app: palette, canvas, properties pane, and preview. _Avoid_: node editor
(too generic), NodeAssets (that is the runtime).

**framework** (the reusable node-graph framework, `src/nodeGraph/`):
The host-agnostic canvas, panes, and editor state that render and edit any visual graph. It imports
nothing from the runtime, so it can later be promoted into a shared node editor for Babylon's other
node tools. _Avoid_: canvas library, widget kit.

**app** (the NodeAssets app layer, `src/nodeAssets/` + `src/services/`):
Everything NodeAssets-specific that binds the framework to the runtime. The only layer where
`NodeAsset` and gltf-transform types appear. _Avoid_: adapter layer (the adapter is one piece of it),
integration.

### On the canvas (framework's visual model)

**node** (`IGraphNode`):
The visual box on the canvas — a titled, colored header over a body of ports. The editor's render of a
runtime block. _Avoid_: block (that is the runtime's word), card.

**port** (`IGraphPort`):
The visual input/output dot on a node. The editor's render of a runtime connection point; its kind
reflects the connection point type. Milestone 01–06 kinds are SCENE, IMAGE, NUMBER, STRING, JSON;
_(milestone 07)_ the three **representation** kinds GLTF_DOCUMENT, USD_STAGE, BABYLON_SCENE (each with
its own port color) plus the NODE_GEOMETRY resource kind. There is no generic "representation" port —
each representation is its own colored kind, so a lossy transcode is a visible node, never an implicit
wire. _Avoid_: connection point (runtime's word), socket, pin.

**wire** (`IGraphWire`):
The visual bezier link from an output port to an input port. The editor's render of a runtime
connection. _Avoid_: connection (runtime's word), edge, link.

**frame** (`IGraphFrame`):
A titled, colored rectangle that groups a set of nodes and moves them together (the NME "Custom
Frames"). _Avoid_: group, container, region.

### Editor machinery (framework)

**editor state** (`GraphEditorState`):
The mutable store that owns the nodes, wires, and frames, tracks selection, and provides
snapshot/restore (undo/redo) and clone (copy/paste). The framework's source of visual truth. _Avoid_:
model, graph store.

**palette** (`IPaletteCategory` / `IPaletteItem`, `PaletteView`):
The left pane's categorized, filterable list of block kinds; dragging an item onto the canvas creates a
node. Categories appear in deterministic order: **Inputs**, **glTF**, **USD**, **Babylon**, **Image**,
**Node Geometry**, **Transcoders**, and **Values**. The five concrete-domain sections group blocks by
their primary operands; Inputs and Transcoders intentionally group cross-domain workflow boundaries,
while Values contains only scalar literal sources. Search includes labels, categories, concise
descriptions, and workflow aliases such as `decimate`, `optimize`, and `compress`; descriptions appear
below item labels. _Avoid_: toolbox, node list.

**resource lane** _(milestone 07)_:
An editor-only **grouping / metadata** axis for organizing nodes and ports by the resource they work on
(e.g. an image lane, a geometry lane). It is a presentation aid **only** — it is **not** a type-system
or selection axis and never changes which representation a port carries or which domain owns a
selection. _Avoid_: lane as a type, channel, track (animation's word).

**gallery** _(milestone 07)_:
The editor's built-in collection of ready-made example graphs (the eight demos of the
scene-representation-platform PRD) a user can open and adapt. _Avoid_: samples browser (informally
fine), templates, examples pane (reserve "examples" for the runtime's example graphs).

**diagnostics surfacing** _(milestone 07)_:
How the editor presents build-scope diagnostics and **LossRecord**s (what a transcoder dropped) on the
offending node and in a diagnostics list, so lossy conversions are visible rather than silent. _Avoid_:
error list (fatals differ), console, log.

**properties pane** (`IPropertySection` / `PropertyDescriptor`, `PropertiesView`):
The right pane showing editable property lines (text, dropdown, slider, switch, color, button) for the
selected node. _Avoid_: inspector, details pane.

**editor context** (`EditorContextValue`):
The contract the framework needs from its host — seeded editor state, palette contents, a
property-section builder, and a node factory. The dependency inversion that keeps the framework
promotable. _Avoid_: props bag, config.

### Binding to the runtime (app)

**graph controller** (`NodeAssetGraphController`):
The adapter that owns the live `NodeAsset` (the source of truth) and keeps a `GraphEditorState` in sync
with it, reconciling visual edits back onto the runtime graph. _Avoid_: bridge, sync manager.

**block descriptor** (`IBlockDescriptor`, the block catalog):
An app-layer entry naming one real block the palette offers — its label, discovery description and
keywords, node color, backend class, and how to construct it. Blocks self-register their descriptor at
module load rather than being hand-listed in a central table, so adding a block is one local change.
_Avoid_: registry, factory map.

**preview** (`PreviewController`, `PreviewPane`):
The right-pane surface showing the built result: the Babylon Viewer V2 loading the exported glb for a
3D pipeline (glTF is the export terminal), or the produced image for an IMAGE pipeline (milestone 04).
_Avoid_: viewport, renderer.

**validation** (`GLTFValidationController`, `GLTFValidationPane`):
Non-blocking Khronos glTF Validator analysis of the latest successful GLB build. The controller
supersedes stale runs; the pane reports issue counts and exposes the complete report. IMAGE outputs are
not applicable, and validator failure never replaces the preview or disables export. _Avoid_: build
validation (runtime graph failures), preflight.

**node diagnostic** (`GraphNodeDiagnostics`):
Ephemeral, host-provided error state keyed by visual node id. Structured runtime build errors decorate
the responsible node and appear in its properties; diagnostics are excluded from save files,
undo/redo, and copy/paste. _Avoid_: graph state, persisted error.

**shell** (`NodeAssetsEditorServiceDefinition`):
The `MakeModularTool` + `IShellService` root that lays the tool out — canvas as central content;
palette, properties, preview, and validation as side panes; run / save / load / undo / redo as toolbar
items. Loads are transactional: malformed or incompatible files produce an error toast without
replacing the current graph. _Avoid_: layout, host.
