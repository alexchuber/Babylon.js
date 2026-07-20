# Node Assets Editor

The Node Assets Editor (NAE) visually authors NodeAssets graphs. It presents compact aggregate
workflows by default while preserving access to the exact primitive graph.

## Language

### Canvas

**node**:
The visual box representing one runtime block.
_Avoid_: block (the runtime term), card, component

**primitive node**:
A node representing one primitive block and one independently orderable user decision.
_Avoid_: leaf node, simple node, internal node

**aggregate node**:
The compact visual form of an aggregate block, showing only its public ports.
_Avoid_: mega-node, group, implicit node

**expanded aggregate**:
An aggregate node opened to reveal its primitive nodes, wires, and exposed ports in a frame-like view.
_Avoid_: ungrouped graph, exploded node, inline conversion

**custom aggregate node**:
The visual form of a custom aggregate block created when an author takes ownership of an aggregate's
internal graph.
_Avoid_: custom block, custom frame, edited built-in

**port**:
The visual input or output for a runtime connection point.
_Avoid_: connection point (the runtime term), socket, pin

**wire**:
The visual relationship between one output port and one input port.
_Avoid_: connection (the runtime term), edge, link

**frame**:
A titled canvas region that groups nodes for layout and movement without changing graph behavior.
_Avoid_: aggregate, container, runtime block

### Palette

**palette**:
The categorized, searchable list of nodes available to add to the canvas.
_Avoid_: toolbox, block registry, node library

**Inputs**:
The default palette category containing Import glTF, Import USD, Import Babylon, and Import Node
Geometry aggregates.
_Avoid_: Sources, Imports, Readers

**operand category**:
A palette category named for the type primarily consumed by its nodes. Universal and glTF are visible
by default; USD, Babylon, and Node Geometry appear when they contain visible primitives.
_Avoid_: lane, block class, transcoder category

**Show primitives**:
A persistent palette preference that reveals blocks already abstracted by built-in aggregates. It
changes palette discovery only, never nodes on the canvas or primitives inside an expanded aggregate.
_Avoid_: advanced mode, expand all, show internals

**hidden primitive**:
A primitive omitted from the default palette because a built-in aggregate provides its common
workflow.
_Avoid_: private block, unavailable block, deprecated block

### Properties

**properties pane**:
The pane containing the selected node's GENERAL section and configurable property sections.
_Avoid_: inspector, details pane, settings

**GENERAL**:
The shared property section containing editable Name and read-only Type.
_Avoid_: metadata, identity section

**Type**:
The read-only GENERAL value identifying the selected node's runtime block type.
_Avoid_: port type, category, display name

**forwarded property**:
A child block property or action shown on its selected aggregate node and backed by the same value.
_Avoid_: copied property, aggregate override, duplicate control

### Library and output

**pipeline library**:
The editor's collection of maintained built-in graphs followed by user-saved graphs.
_Avoid_: gallery, demo catalog, palette

**built-in pipeline**:
A source-controlled, executable library graph that demonstrates a supported source-to-GLB workflow.
_Avoid_: screenshot, mock, obsolete sample

**preview**:
The rendered view of the latest successful GLB build.
_Avoid_: scene, source view, image preview

**validation**:
Non-blocking Khronos glTF Validator analysis of the latest successful GLB.
_Avoid_: build validation, preview error, runtime diagnostic

**node diagnostic**:
Ephemeral build feedback attached to the node responsible for a runtime failure.
_Avoid_: saved graph state, validation issue, console log
