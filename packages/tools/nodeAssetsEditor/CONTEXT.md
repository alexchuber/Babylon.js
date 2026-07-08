# Node Assets Editor

The `@tools/node-assets-editor` tool: a fresh Fluent node editor (same component library and style as
Inspector V2) that authors and previews NodeAssets graphs. It has two layers — a **reusable node-graph
framework** that is deliberately domain-agnostic, and a **NodeAssets app** that binds that framework to
the `@babylonjs/node-assets` runtime. The runtime terms it visualizes live in
`packages/dev/node-assets/CONTEXT.md`; this glossary is the editor's own vocabulary.

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
The visual input/output dot on a node. The editor's render of a runtime connection point. _Avoid_:
connection point (runtime's word), socket, pin.

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
node. _Avoid_: toolbox, node list.

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
An app-layer entry naming one real block the palette offers — its label, node color, backend class, and
how to construct it. Deliberately a plain table, not a registry. _Avoid_: registry, factory map.

**preview** (`PreviewController`, `PreviewPane`):
The Babylon engine and scene in the right pane that loads the exported glb back through Babylon's glTF
loader and displays it. _Avoid_: viewport, renderer.

**shell** (`NodeAssetsEditorServiceDefinition`):
The `MakeModularTool` + `IShellService` root that lays the tool out — canvas as central content;
palette, properties, and preview as side panes; run / save / load / undo / redo as toolbar items.
_Avoid_: layout, host.
