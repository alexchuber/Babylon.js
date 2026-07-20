# PRD — 08 Universal funnel palette

Status: ready-for-agent

## Problem Statement

The Node Assets Editor currently exposes an implementation-shaped collection of import blocks,
representation-specific blocks, selectors, image operations, values, material operations, and pairwise
transcoders. This makes the product feel like several partial systems placed next to one another rather
than one reusable asset-optimization language.

For the proof of concept, users need one obvious workflow:

```text
source format → Universal → optimization → glTF → GLB
```

The graph should make important conversion and encoding decisions inspectable without forcing ordinary
users to assemble every low-level block. Common workflows should therefore appear as compact aggregate
blocks that can expand into their real primitive subgraphs. Experts must still be able to reveal and use
those primitives directly.

The proof of concept does not need faithful, independently useful USD, Babylon, or Node Geometry
domains. There are no domain operators for those representations in this scope. Their only purpose is to
funnel source content into Universal. Likewise, the product does not currently need selectors, generic
value blocks, image pipelines, or material assembly.

The current built-in pipeline library also reflects the old palette. Several entries depend on nodes
that are leaving the product surface. If it is not migrated with the palette, users will open obsolete
graphs or encounter samples that no longer build.

## Solution

Reshape NodeAssets and the Node Assets Editor around a single public **Universal** working type. For this
proof of concept, Universal is implemented internally with a gltf-transform `Document`; that
implementation detail is not exposed in user-facing names or port labels.

Provide four compact import aggregates:

```text
Import glTF          = Read glTF          → glTF          → Universal
Import USD           = Read USD           → USD           → Universal
Import Babylon       = Read Babylon       → Babylon       → Universal
Import Node Geometry = Read Node Geometry → Node Geometry → Universal
```

Provide one compact export aggregate:

```text
Export glTF = Universal → glTF → Write glTF
```

Make built-in aggregates real typed subgraphs with AggregateBlock semantics and Custom Frame-like
expand/collapse interaction. Selecting an aggregate shows the configurable properties and actions of
its internal blocks in the properties pane. In particular, selecting either **Export glTF** or its
internal **Write glTF** block exposes the same **Export .glb** action.

Add a **Show primitives** checkbox to the palette header, unchecked by default. It reveals only blocks
normally abstracted by built-in aggregates. The setting affects palette discovery, not nodes already on
the canvas or primitives visible inside an expanded aggregate.

The default palette is:

| Category | Family | Blocks |
| --- | --- | --- |
| Inputs | Aggregate imports | Import glTF; Import USD; Import Babylon; Import Node Geometry |
| Universal | Cleanup | Weld Vertices; Deduplicate Resources; Remove Unused Resources; Remove Degenerate Geometry; Fix Face Winding |
| Universal | Reduction | Quantize Attributes; Simplify Meshes |
| Universal | Structure | Flatten Hierarchy; Join Meshes; Split Meshes by Material; Merge Scenes; Transform Scene; Center Scene |
| Universal | Attributes | Recompute Normals; Generate Tangents; Strip Attributes |
| Universal | Textures | Resize Textures |
| glTF | Encoding/output | Compress Geometry (Draco); Compress Textures (KTX2); Export glTF |

With **Show primitives** enabled, the palette additionally exposes:

| Category | Primitive blocks |
| --- | --- |
| Inputs | Read glTF; Read USD; Read Babylon; Read Node Geometry |
| Universal | Universal → glTF; Deduplicate Materials; Deduplicate Textures; Reuse Identical Meshes; Deduplicate Data |
| glTF | glTF → Universal; Write glTF |
| USD | USD → Universal |
| Babylon | Babylon → Universal |
| Node Geometry | Node Geometry → Universal |

All blocks expose editable **Name** and read-only **Type**, where Type is the block class name.

## User Stories

1. As a new pipeline author, I want to start with an Import block and end with Export glTF, so that the
   intended workflow is obvious.
2. As a new pipeline author, I want Universal operations to share one wire type, so that I can reorder
   and reuse optimization blocks without thinking about source formats.
3. As a glTF user, I want Import glTF to produce Universal content, so that I can use the same
   optimization flow as every other source format.
4. As a USD user, I want Import USD to produce Universal content, so that I can optimize USD content
   without learning a separate USD pipeline.
5. As a Babylon user, I want Import Babylon to produce Universal content, so that I can optimize a
   `.babylon` source and deliver GLB.
6. As a Node Geometry user, I want Import Node Geometry to produce Universal content, so that evaluation
   and conversion do not require extra visible setup blocks.
7. As a casual user, I want Import glTF to appear as one block, so that file reading and transcoding do
   not make a simple graph verbose.
8. As a casual user, I want Export glTF to appear as one block, so that conversion and file writing do
   not make a simple graph verbose.
9. As an advanced user, I want to expand an Import or Export aggregate, so that I can inspect the real
   primitive operations it contains.
10. As an advanced user, I want expanded aggregate ports and wires to remain type-accurate, so that the
    compact view never hides an invalid graph.
11. As an advanced user, I want to collapse an expanded aggregate, so that a detailed graph can become
    readable again.
12. As an advanced user, I want to detach and customize an aggregate's internal subgraph, so that I can
    create a one-off workflow without changing the built-in aggregate definition.
13. As a graph author, I want built-in aggregates to round-trip through save/load, so that reopening a
    graph preserves its behavior.
14. As a graph author, I want aggregate expansion state to round-trip through save/load, so that my
    preferred canvas view is restored.
15. As a graph author, I want aggregate properties to include internal block configuration, so that
    collapsing a subgraph does not remove access to important controls.
16. As a graph author, I want Import aggregate properties to show the internal Read block's source
    controls, so that I can change files without expanding the aggregate.
17. As a graph author, I want Export glTF properties to show the internal Write glTF controls, so that I
    can name and download the result without expanding the aggregate.
18. As a graph author, I want the Export .glb action on both Export glTF and Write glTF, so that the
    download workflow is consistent in compact and primitive graphs.
19. As a graph author, I want child properties with similar names to remain clearly attributed, so that
    aggregate property panes are not ambiguous.
20. As a graph author, I want every node to show editable Name and read-only Type, so that the UI follows
    Babylon's existing node-editor convention.
21. As a beginner, I want primitives hidden by default, so that the palette presents decisions rather
    than implementation scaffolding.
22. As an expert, I want a Show primitives checkbox in the palette header, so that I can reveal and use
    the low-level building blocks.
23. As a returning expert, I want the Show primitives preference to persist locally, so that I do not
    repeatedly restore my preferred palette view.
24. As a graph author, I want hidden primitives already present on the canvas to remain visible, so that
    changing the palette filter never alters my graph.
25. As a graph author, I want primitives inside an expanded aggregate to remain visible regardless of
    the palette preference, so that aggregate inspection is reliable.
26. As a graph author, I want search to exclude hidden primitives when Show primitives is off, so that
    search results match the visible palette.
27. As a graph author, I want empty primitive-only categories omitted when Show primitives is off, so
    that USD, Babylon, and Node Geometry do not appear as empty sections.
28. As a glTF author, I want Read glTF to accept a URL or an uploaded file, so that local and remote
    sources use the same block.
29. As a USD author, I want Read USD to accept a URL or an uploaded file, so that local and remote
    sources use the same block.
30. As a Babylon author, I want Read Babylon to accept a URL or an uploaded file, so that local and
    remote sources use the same block.
31. As a Node Geometry author, I want Read Node Geometry to accept a snippet ID or an uploaded graph, so
    that Playground and local workflows are both supported.
32. As a source-block user, I want the last URL, snippet, or upload I choose to become the active source,
    so that source precedence is predictable.
33. As a source-block user, I want source configuration in the properties pane rather than on wires, so
    that data-flow ports remain about asset values.
34. As a proof-of-concept user, I want USD, Babylon, and Node Geometry Reads to be lightweight source
    payloads, so that implementation effort goes toward the Universal optimization flow rather than
    unused native domains.
35. As a Node Geometry user, I want Node Geometry → Universal to own parsing and evaluation, so that
    there is no confusing standalone Evaluate Node Geometry block.
36. As a pipeline author, I want all format funnels to be explicit when primitives are shown, so that I
    can understand where conversion occurs.
37. As a pipeline author, I want glTF, USD, Babylon, Node Geometry, and Universal to remain distinct port
    kinds, so that matching internal implementations do not create implicit cross-type wiring.
38. As a pipeline author, I want only Universal → glTF as an outbound transcoder, so that every pipeline
    converges on the supported GLB delivery path.
39. As a pipeline author, I do not want pairwise USD/Babylon/glTF transcoders, so that the conversion
    vocabulary remains small.
40. As a pipeline author, I want Weld Vertices as an independently reusable cleanup decision, so that I
    can place it where topology permits.
41. As a pipeline author, I want Deduplicate Resources as a compact aggregate, so that common
    deduplication does not require four nodes.
42. As an advanced pipeline author, I want separate Deduplicate Materials, Deduplicate Textures, Reuse
    Identical Meshes, and Deduplicate Data primitives, so that I can configure and order their effects
    independently.
43. As a pipeline author, I want Reuse Identical Meshes to describe shared mesh resources accurately,
    so that it is not confused with runtime GPU instancing.
44. As a pipeline author, I want Remove Unused Resources separated from Remove Degenerate Geometry, so
    that resource cleanup and geometry repair remain independent decisions.
45. As a pipeline author, I want Fix Face Winding separate from Recompute Normals, so that correcting
    orientation does not imply replacing shading data.
46. As a pipeline author, I want Quantize Attributes and Simplify Meshes to remain single configurable
    blocks, so that algorithm tuning does not create palette variants.
47. As a pipeline author, I want structure operations such as flattening, joining, splitting, merging,
    transforming, and centering to be independent blocks, so that I can compose only the changes I need.
48. As a pipeline author, I want Recompute Normals, Generate Tangents, and Strip Attributes to be
    independent blocks, so that attribute generation and removal are explicit.
49. As a pipeline author, I want Resize Textures to operate on textures within Universal content, so
    that I can reduce texture dimensions without a detached image pipeline.
50. As a pipeline author, I do not want Reencode Textures or Pack Texture Channels in this proof of
    concept, so that encoding and material semantics remain focused.
51. As a glTF delivery author, I want Compress Geometry (Draco) to remain an explicit glTF → glTF
    block, so that mesh encoding is visible.
52. As a glTF delivery author, I want Compress Textures (KTX2) to remain an explicit glTF → glTF
    block, so that texture encoding is visible.
53. As an advanced glTF delivery author, I want to build
    `Universal → glTF → codecs → Write glTF`, so that target-format decisions stay outside Universal.
54. As a casual glTF delivery author, I want Export glTF to bypass explicit target-lane assembly, so that
    I can download an ordinary GLB quickly.
55. As a pipeline-library user, I want every bundled graph to use the current palette vocabulary, so
    that examples teach the intended system.
56. As a pipeline-library user, I want obsolete selector, image, value, and material examples removed,
    so that opening a bundled graph never depends on retired product surfaces.
57. As a pipeline-library user, I want examples for glTF, USD, Babylon, and Node Geometry funnels, so that
    every supported source has a working reference.
58. As a pipeline-library user, I want an advanced compression example, so that I can learn when to use
    Universal → glTF, Compress Textures (KTX2), Compress Geometry (Draco), and Write glTF.
59. As a pipeline-library user, I want a multi-source merge example, so that I can see different formats
    converge into the same Universal flow.
60. As a pipeline-library user, I want every bundled graph to preview successfully, so that examples are
    executable documentation.
61. As a user upgrading an existing saved graph, I want unsupported old palette blocks to fail clearly
    or remain load-compatible when practical, so that migration is intentional rather than silent.
62. As a maintainer, I want the runtime and editor to use one aggregate model, so that behavior does not
    diverge between execution, serialization, palette creation, and properties.
63. As a maintainer, I want Universal's gltf-transform implementation kept behind its type seam, so that a
    future Universal representation can replace it without changing authored graphs.
64. As a maintainer, I want the completed implementation examined for deepening opportunities, so that
    the rework does not leave shallow aggregate, descriptor, or property-forwarding modules behind.

## Implementation Decisions

1. **Universal is the public working type.** It is a distinct connection point type and port label even
   though the proof-of-concept adapter uses a gltf-transform `Document` internally. The internal value
   may reuse existing glTF document machinery, but glTF and Universal connections must not connect
   without an explicit transcoder.

2. **The supported topology is a funnel.** Source formats enter Universal, Universal operators compose
   the optimization trunk, Universal exits only to glTF, and Write glTF produces GLB. There is no
   Universal → Babylon, Universal → USD, Universal → Node Geometry, or pairwise native transcoder.

3. **Only two domains have operators.** Universal owns content optimization. glTF owns target encoding
   and GLB writing. USD, Babylon, and Node Geometry have no domain operators in this proof of concept.

4. **Read blocks are source boundaries.**
   - Read glTF has a URL text property and Upload glTF action.
   - Read USD has a URL text property and Upload USD action.
   - Read Babylon has a URL text property and Upload Babylon action.
   - Read Node Geometry has a Snippet ID text property and Upload Node Geometry action.
   - Source controls are properties, never connection points.
   - URL/snippet and uploaded-file sources are mutually exclusive; the last successful choice wins.
   - Existing uploaded-source persistence behavior is retained.

5. **Non-glTF source representations are intentionally shallow payloads.** Read USD, Read Babylon, and
   Read Node Geometry only need to carry resolved source information or bytes to their one legal
   consumer. Their matching transcoder owns parsing, evaluation, and conversion to Universal. They do
   not need faithful independently operable native models.

6. **Node Geometry evaluation is internal.** Node Geometry → Universal is the one semantic conversion.
   Parsing and evaluation happen inside it. There is no palette entry for Evaluate Node Geometry and no
   intermediate Babylon representation in the authored graph.

7. **Built-in aggregates have runtime subgraph semantics.** Import glTF, Import USD, Import Babylon,
   Import Node Geometry, Export glTF, and Deduplicate Resources execute as typed compositions of ordinary
   primitive blocks. They are not union-typed mega-blocks and do not rely on invisible implicit
   conversion.

8. **Built-in aggregates use expandable-frame interaction.** An aggregate is compact by default and can
   expand to reveal its internal nodes, wires, and exposed ports. Collapsing restores the compact node.
   Editing a built-in aggregate's internals explicitly detaches it into a CustomAggregateBlock so that
   the built-in definition remains stable.

9. **Aggregate persistence is observable, not storage-prescriptive.** Save/load must preserve aggregate
   identity, behavior, public ports, configuration, and expansion state. A detached custom aggregate
   must preserve its owned internal graph. The exact serialized encoding is implementation-owned and
   versioned.

10. **Aggregate properties are composed from child descriptors.** The selected aggregate shows its own
    GENERAL section followed by every user-configurable non-GENERAL child section and action. Child
    sections retain or add child labels when needed to prevent collisions. Editing a forwarded property
    updates the actual internal block. Duplicate child Name/Type controls are not shown.

11. **Aggregate actions behave identically to primitive actions.** Export glTF forwards Write glTF's
    file name and Export .glb action. Import aggregates forward their Read block's source text and
    upload action. Selecting either layer operates on the same state and produces the same result.

12. **Every node follows Babylon's GENERAL convention.** Name is editable. Type is read-only and returns
    the block class name. Aggregate Type identifies the aggregate class, not an arbitrary internal
    child.

13. **The palette catalog records primitive visibility and aggregate relationships.** Show primitives is
    an editor preference, defaults to false, persists locally, filters palette categories and search,
    and never removes canvas nodes. Use Fluent UI conventions and semantic theme tokens; do not add raw
    color hex values or ad hoc checkbox styling.

14. **Deduplicate Resources is the convenience aggregate.** Its ordered internal primitives are Deduplicate
    Materials, Deduplicate Textures, Reuse Identical Meshes, and Deduplicate Data. The primitives map to
    semantic resource effects rather than mechanically exposing one block per implementation enum.
    Deduplicate Data owns accessor/skin deduplication. Algorithm options remain properties.

15. **Universal block catalog and properties:**
    - Weld Vertices: overwrite existing.
    - Deduplicate Materials/Textures/Reuse Identical Meshes/Deduplicate Data: keep unique names.
    - Remove Unused Resources: kept property types, leaf nodes, attributes, solid textures, and extras.
    - Remove Degenerate Geometry: tolerance.
    - Fix Face Winding: no required property.
    - Quantize Attributes: position, normal, texture-coordinate, color, weight, and generic bits; normalize weights;
      attribute and morph-target patterns; quantization volume; cleanup.
    - Simplify Meshes: target ratio, error limit, lock border.
    - Flatten Hierarchy: cleanup empty nodes.
    - Join Meshes: keep separate meshes, keep named nodes, cleanup.
    - Split Meshes by Material: no required property.
    - Merge Scenes: variadic Universal inputs and Add input.
    - Transform Scene: units, scale, rotation, and up axis.
    - Center Scene: center/above/below/custom-point pivot and custom point.
    - Recompute Normals: overwrite existing.
    - Generate Tangents: no required property.
    - Strip Attributes: selected attribute kinds.
    - Resize Textures: maximum dimensions and resize mode.

16. **glTF block catalog and properties:**
    - Compress Geometry (Draco) remains glTF → glTF and exposes method, encode/decode speed, position/normal/color/
      texture-coordinate/generic quantization bits, quantization volume, custom bounds, and compatibility
      information.
    - Compress Textures (KTX2) remains glTF → glTF and retains the researched KTX2/Basis option surface: mipmaps,
      texture and slot filters, output container, ETC1S/UASTC settings, perceptual metrics, transfer
      function, RDO, Zstandard, normal-map tuning, Flip Y, HDR, metadata, and encoder locations.
    - Write glTF is glTF → terminal bytes and exposes file name plus Export .glb.
    - Export glTF is Universal → terminal bytes through Universal → glTF and Write glTF.

17. **Primitive visibility is selective.** Read/Write blocks, the five funnel transcoders, and the four
    deduplication primitives are hidden by default because aggregates cover them. Compress Geometry
    (Draco), Compress Textures (KTX2), and standalone Universal operators remain visible because no
    aggregate replaces their user decision.

18. **Selectors, accessors, image blocks, values, and material blocks leave the product surface.** Their
    descriptors and bundled examples are removed. Existing runtime classes may remain registered for
    saved-graph compatibility when doing so is inexpensive and does not reintroduce them to the palette.
    Do not preserve obsolete classes by complicating the new aggregate or type interfaces.

19. **The built-in pipeline library is migrated as part of the feature.** It contains current, buildable
    examples covering:
    - glTF optimization and aggregate export;
    - USD to optimized glTF;
    - Babylon to optimized glTF;
    - Node Geometry to glTF;
    - multi-source Universal merge;
    - advanced glTF compression using Universal → glTF, Compress Textures (KTX2),
      Compress Geometry (Draco), and Write glTF;
    - a representative full Universal optimization pipeline.
    Obsolete custom-texture, material-decomposition, selector, value, and image examples are removed.

20. **The default graph is a maintained library-quality graph.** It continues to exercise real preview
    and GLB download. If it demonstrates the advanced glTF lane, hidden primitives may appear on the
    canvas even while Show primitives is off; palette filtering never hides existing nodes.

21. **Migration is explicit.** Update serialization aliases or compatibility registrations needed for
    current saved graphs, and update all editor descriptors, default graphs, library graphs, search
    metadata, tests, and domain documentation in the same change. Do not leave old and new palette
    vocabularies active simultaneously.

22. **The latest NAE preview work is the implementation baseline.** Preserve the recent operand-domain
    grouping, Inputs rename, material-block removal, and preview restoration fixes while replacing the
    old representation/transcoder model with this PRD.

23. **No new dependency is assumed.** Prefer existing gltf-transform functions and Babylon facilities.
    If a missing operator truly requires a dependency, verify provenance and vulnerabilities before
    adding it and keep the dependency behind the Universal block implementation.

24. **Architecture review is a completion gate.** After implementation, migration, and tests pass, invoke
    `improve-codebase-architecture` over the changed NodeAssets runtime and Node Assets Editor modules.
    Generate its HTML report outside the repository, identify its top recommendation, and report the
    result. Do not silently expand scope into unrelated refactors; directly caused architectural defects
    must be resolved before completion, while unrelated candidates require separate approval.

## Testing Decisions

- Good tests verify observable behavior through public interfaces. They do not inspect private aggregate
  storage, duplicate implementation algorithms in assertions, or mock internal child-block calls merely
  to prove composition.

- Two test seams are confirmed:
  1. **NodeAsset build and graph serialization** are the runtime seam.
  2. **The Node Assets Editor Playwright interface** is the product seam.

- At the runtime seam, prove that each Import aggregate builds the same result as its expanded primitive
  graph, each Universal operator composes in a representative chain, Export glTF matches
  Universal → glTF → Write glTF, aggregate graphs round-trip through serialization, and detached custom
  aggregates retain their internal graph.

- Runtime tests use small independent fixtures for glTF, USD, Babylon, and Node Geometry. Assertions
  inspect resulting GLB validity and externally meaningful asset facts rather than private child
  invocation order.

- Runtime tests prove that glTF and Universal remain incompatible port kinds without an explicit
  transcoder even though both may contain a gltf-transform `Document` internally.

- Runtime tests prove that Node Geometry → Universal performs the required evaluation without a separate
  Evaluate node and that USD/Babylon/Node Geometry source payloads cannot be wired to unrelated domains.

- Runtime tests prove semantic deduplication primitives independently and prove that Deduplicate
  Resources produces the same observable result as their documented composition.

- Existing operator-pipeline, import/export metadata, serialization-schema, block-registry, and
  connection-point tests are the closest runtime prior art.

- At the editor seam, Playwright proves the default palette contains only the agreed aggregates and
  visible operators, Show primitives reveals the exact additional catalog, the preference persists,
  search follows visibility, and empty hidden-only categories disappear.

- Playwright expands and collapses each aggregate, confirms exposed ports and wires, saves and reloads the
  graph, detaches/customizes an aggregate, and verifies the customized graph still builds.

- Playwright selects Import aggregates and their Read primitives and proves both surfaces edit the same
  URL/snippet/upload state.

- Playwright selects Export glTF and Write glTF separately, clicks Export .glb from each properties pane,
  and verifies both downloads are non-empty GLB files with the expected filename.

- Playwright loads and successfully previews every bundled pipeline-library entry. The library list and
  executable graphs derive from the same production catalog; tests do not maintain a second list.

- Playwright exercises one source from each supported format through Universal optimization to GLB,
  including an advanced glTF-native codec path.

- Existing palette-category, block-property-section, NodeAsset Library, default orb pipeline, preview,
  validation, and download tests are the closest editor prior art.

- Tests are developed in vertical red/green slices: one externally visible behavior, its minimal
  implementation, then the next behavior. Broad snapshots of the entire palette are supplementary, not
  substitutes for behavioral assertions.

## Out of Scope

- A production Universal representation independent of gltf-transform.
- Faithful, independently operable USD, Babylon, or Node Geometry in-graph domains.
- USD, Babylon, or Node Geometry domain operators.
- USD, Babylon, Node Geometry, image, FBX, OBJ, or STL output terminals.
- Universal → USD, Universal → Babylon, Universal → Node Geometry, or pairwise native transcoders.
- A mega-port Transcode block, union-typed representation ports, implicit conversion, or path planning.
- A standalone Evaluate Node Geometry block or a visible intermediate Babylon conversion for Node
  Geometry.
- Selectors, property accessors, pointer/query blocks, selection values, or selection remapping.
- Number, String, or JSON value-literal blocks.
- The detached Image domain, image import/export, and individual image operations.
- Material construction, decomposition, or property editing.
- Reencode Textures and Pack Texture Channels.
- UV repacking/collapse, texture atlasing, remeshing, and map baking.
- Conformance macros, diagnostics blocks, assertions, branching, variants, and diff/report blocks.
- Automatic implementation of architecture-review suggestions unrelated to this feature.

## Further Notes

- This PRD intentionally narrows the earlier first-class-representation direction for the proof of
  concept. Existing documentation that says there is no Universal hub or that Node Geometry requires
  separate Evaluate/Bake blocks no longer describes this product surface and must be reconciled during
  implementation.

- “Universal” is a user-facing abstraction and a future replacement seam. Developers may document that
  the proof-of-concept adapter uses gltf-transform internally, but UI copy, palette labels, ports, and
  saved graph semantics must not call Universal “glTF Document.”

- The key product principle is: **one semantic user decision per primitive, aggregates for common
  workflows**. Algorithm tuning belongs in properties; independently orderable effects belong in
  separate primitives.

- The expected simple graph is:

  ```text
  Import glTF → [Universal operations] → Export glTF
  ```

- The equivalent inspectable graph is:

  ```text
  Read glTF → glTF → Universal → [Universal operations] → glTF → Write glTF
  ```

- The advanced target-format graph is:

  ```text
  Import glTF → [Universal operations] → Universal → glTF
              → Compress Textures (KTX2) → Compress Geometry (Draco) → Write glTF
  ```
