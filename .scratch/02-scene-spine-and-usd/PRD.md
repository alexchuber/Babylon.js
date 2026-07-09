# PRD — 02 Scene spine & USD transcoding

> Milestone 02 of the NodeAssets POC. Builds directly on `01-nae-scaffolding`. Breadth-first: the
> goal is to prove "any format in" and grow the middle of the graph, not to perfect the architecture.

## Problem Statement

Today NodeAssets can only take a glTF in and put a glTF out, and the only "middle" steps are Draco
and KTX2 compression. As someone preparing 3D content for the web, I have assets in other authoring
formats (USD is the one I care about first) and I want to bring them into the same visual pipeline —
but there is no way in. The single wire type is literally called `GLTF`, which frames the tool as a
glTF utility rather than the general "messy middle" pipeline it's meant to be. Separately, a saved
graph that uses the KTX2 block fails to load, because that block was never added to the loader's
class switch — so the save/load story I shipped in milestone 1 is quietly broken for one of my four
blocks.

## Solution

Reframe the one wire type from `GLTF` to **SCENE**: the payload is still a gltf-transform `Document`,
but the name now says what it is — the single normalized spine that every format funnels through.
Add the first non-glTF entry point, an **ImportUSDBlock** that parses USD via a WebAssembly build of
tinyusdz and transcodes it onto the SCENE spine. Grow the middle of the graph with a library of
**operator blocks** that wrap the `@gltf-transform/functions` operations (dedup, prune, weld,
quantize, simplify, flatten, join, …) as SCENE→SCENE steps. Finally, fix block registration so every
block — including KTX2 — round-trips through save/load, by having blocks self-register instead of
relying on a hand-maintained switch that someone will always forget to update.

## User Stories

1. As a pipeline author, I want the wire type named SCENE rather than GLTF, so that the graph reads
   as a general asset pipeline and not a glTF-only tool.
2. As a pipeline author, I want to import a `.usd` / `.usdz` / `.usda` file as a source block, so that
   I can start a pipeline from USD content.
3. As a pipeline author, I want my imported USD to appear on the SCENE spine-- as losslessly as possible-- so that every existing middle and export block works on it unchanged.
4. As a pipeline author, I want the USD import to tell me (in docs and/or a node note) what it keeps
   and what it drops, so that I'm not surprised when variants/layers don't survive.
5. As a pipeline author, I want a "deduplicate" operator block, so that repeated meshes/materials/
   textures collapse and my output shrinks.
6. As a pipeline author, I want a "prune" operator block, so that unused nodes/materials/textures are
   removed from the document.
7. As a pipeline author, I want a "weld" operator block, so that duplicate vertices are merged and
   geometry is tighter.
8. As a pipeline author, I want a "quantize" operator block, so that I can reduce attribute precision
   before export.
9. As a pipeline author, I want a "simplify" operator block, so that I can decimate geometry to a
   target ratio.
10. As a pipeline author, I want each operator block's key parameters exposed in the properties pane,
    so that I can tune them without editing code.
11. As a pipeline author, I want to chain several operator blocks between import and export, so that I
    can compose a real optimization pipeline visually.
12. As a pipeline author, I want to save a graph that contains a KTX2 block and load it back
    successfully, so that my saved pipelines are not silently corrupt.
13. As a contributor, I want to add a new block without editing a central switch statement and a
    separate palette table, so that I can't forget a registration step and ship a load-time crash.
14. As a pipeline author, I want the palette to group these new blocks sensibly (Sources vs.
    Operators), so that I can find them as the catalog grows.

## Implementation Decisions

- **SCENE rename.** Rename the sole `NodeAssetConnectionPointType.GLTF` value to `SCENE`. The payload
  is unchanged (a gltf-transform `Document`); this is a naming/semantics change that makes the spine
  explicit. Update the boundary blocks and CONTEXT glossaries to match. (See ADR 0001.)
- **USD import via tinyusdz-web.** Add `ImportUSDBlock` (a source block, no inputs, one SCENE output).
  It uses a WebAssembly build of tinyusdz (lighttransport/tinyusdz `release/web`) to parse USD, then
  transcodes the parsed stage onto a new gltf-transform `Document`. WASM/JS assets are delivered by
  URL, mirroring the existing Draco/KTX2 pattern where the decoder/encoder is injected rather than
  bundled.
- **Transcoder scope.** The USD→SCENE transcoder maps geometry (meshes/primitives), materials
  (UsdPreviewSurface → glTF PBR where it maps cleanly), and the node/transform hierarchy. USD
  concepts glTF can't express (layers/composition arcs, variants, relationships, non-preview shaders)
  are flattened, approximated, or dropped at this boundary. Express as much as possible, as faithfully as possible, by researching glTF format and its extensions. If the Babylon glTF 2.0 loader can load it, then make it happen. This is the lossy-funnel behaviour called out in ADR 0001.
- **Operator block library.** Wrap `@gltf-transform/functions` operations as individual SCENE→SCENE
  blocks (one block per operation, e.g. dedup, prune, weld, quantize, simplify, flatten, join,
  normals, center). Each block applies the corresponding transform to the incoming `Document` and
  passes it along. Parameters that matter (e.g. simplify ratio/error, quantize bits) surface as
  property lines.
- **Self-registration.** Replace the `CreateBlockByClassName` switch in the runtime and the parallel
  block-descriptor table in the editor with a self-registration mechanism: each block registers its
  class-name → factory (and the editor its palette descriptor) at module load, so adding a block is a
  single local change. The KTX2 load bug is fixed as a consequence, and a regression test locks it in.
- **In-place mutation is retained** for these linear operator chains; fan-out correctness is
  explicitly deferred to slice 05.

## Testing Decisions

- **Reuse the existing headless `buildAsync()` seam** — the primary behavioral seam from milestone 1.
  Good tests here construct a graph in code, call `buildAsync()`, and assert on the *output* (bytes or
  a re-parsed Document's counts/flags), never on private evaluation internals.
- **USD import test:** a tiny fixture (`.usda` text or small `.usdz`) → ImportUSD → ExportGLTF; assert
  the output Document has the expected mesh/material/node counts. Prior art: the milestone-1
  glTF-roundtrip test.
- **Operator block tests:** for each operator, build ImportGLTF → operator → Export and assert the
  operator's observable effect on the output Document (e.g. fewer materials after dedup, fewer/prune
  removed nodes, vertex-count drop after weld/simplify). Prior art: the Draco/KTX2 compression tests
  that assert on the exported document's flags/extensions.
- **Save/load regression test:** serialize a graph containing a KTX2 block, parse it back, and assert
  the block is reconstructed — the test that would have caught the milestone-1 bug.
- **Editor Playwright** is only exercised if a new palette grouping needs interaction coverage; prefer
  the headless seam.

## Out of Scope

- Other importers (OBJ, STL, FBX, CAD) — the SCENE spine makes each of these "just another
  transcoder," but they are their own later slices.
- Exporting to any format other than glTF/glb.
- High-fidelity USD support (variants, layers, composition, animation, skinning beyond what maps to
  glTF). We take the pragmatic subset.
- Per-node memoization / fan-out correctness (slice 05).
- A block registry abstraction beyond the minimal self-registration needed to fix the bug and stop
  double-bookkeeping.

## Further Notes

- tinyusdz publishes an experimental web/WASM target; treat the exact build/asset-loading integration
  as a spike — if the web build proves impractical in the timebox, fall back to a smaller USD subset
  parser, but keep the block's SCENE-output contract identical so the rest of the graph is unaffected.
- The SCENE rename is deliberately done here, first, so every subsequent slice speaks in terms of the
  spine rather than "GLTF."
- This slice is where "breadth" becomes visible: after it, the palette has a Sources category with
  more than one entry and an Operators category with many.
