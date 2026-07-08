# Node Assets

The NodeAssets content-pipeline context: a functional, registry-driven graph that takes source
assets (glTF now; USD/images later) through composable operations and emits an optimized,
Babylon-ready glTF, plus the Fluent visual editor that authors those graphs. Several terms below
exist specifically to avoid colliding with Babylon's existing vocabulary.

> Pre-code home. This glossary lives here while NodeAssets is still design-only. When issue 01
> scaffolds `packages/dev/nodeAssets/`, this file moves to `packages/dev/nodeAssets/CONTEXT.md` and
> is registered in a root `CONTEXT-MAP.md`.

## Language

### Authoring

**NodeAsset**:
The authoring object — one node-defined asset pipeline. A singular class mirroring `NodeMaterial`.
The product is "NodeAssets"; the editor is the "Node Assets Editor".
_Avoid_: pipeline object, graph object

**operation**:
A reusable definition registered once in the operation registry (id, label, ports, output, default
settings, optional phase, and a `run` function). The registry is the single source of truth all
surfaces read from.
_Avoid_: block, step, morph

**handle**:
In the code API, the reference to a node's output that further calls chain from.
_Avoid_: ref, token

### The graph model

**node**:
A placed instance of an operation inside a graph. Not a Babylon scene-graph `Node`, and not a member
of the `NodeMaterial` / `NodeGeometry` family.

**port**:
A named, typed input on a node. Import nodes have none; composing operations have several.
_Avoid_: slot, socket, pin

**wire**:
A typed connection carrying a whole asset from one node's output to another node's input port. In
the serialized graph definition the same connection is called an **edge**.
_Avoid_: connection, link

**asset**:
The payload flowing along a wire. Opaque to the orchestration layer, which knows only its format;
for the glTF format the payload is a gltf-transform `Document`. Distinct from Babylon's
`AssetContainer`.
_Avoid_: document (at the orchestration layer), model, container

**file type**:
The kind of an asset — glTF, USD, image — which types a wire. Only compatible formats connect;
crossing formats requires an explicit conversion operation.
_Avoid_: asset format, mime

**phase**:
Whether an operation edits *content* or performs *compression*. Orthogonal to format; drives the
"compression comes last" validation.

**import node**:
A node with no inputs — the pipeline's entry point.
_Avoid_: importer, source, input node

**export node**:
A terminal node that produces the deliverable bytes — the pipeline's exit point.
_Avoid_: exporter, sink, output node

**capability**:
A per-format primitive the orchestration layer uses without knowing a format's internals
(bytes → asset, asset → bytes, clone). For glTF, the only place the runtime spine touches
gltf-transform, so gltf-transform stays swappable.
_Avoid_: adapter, provider, backend

**graph definition**:
The saved, decoupled form of a pipeline: a list of nodes and a list of edges. The thing that is
serialized, loaded, and run.
_Avoid_: graph document (collides with gltf-transform's `Document`), graph doc, scene
