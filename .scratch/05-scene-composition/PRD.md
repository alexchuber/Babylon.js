# PRD — 05 Scene composition

> Milestone 05 of the NodeAssets POC. Takes the graph from linear/single-source to a true DAG: combine
> multiple scenes into one, and make the evaluator correct when a scene feeds more than one consumer.
> Placement reuses the SetProperty selector from slice 03 — no bespoke transform node.

## Problem Statement

Every graph so far is a single line from one source to one export. Real composition isn't: I want to
assemble a final scene from parts — drop a chair into a room, build a product from components, place
several imported pieces into one deliverable. Two things block me. First, there is no node that
combines scenes. Second, the moment I fan a scene out to two branches or merge two edits back
together, the runtime does the wrong thing: it re-evaluates shared upstream blocks (no evaluate-once),
and because blocks mutate the SCENE `Document` in place, two branches editing the same upstream scene
stomp each other. So even if I wire a diamond, the result is corrupt.

## Solution

Make the evaluator correct for DAGs: **evaluate each block once per build** (cache its output), and
**copy SCENE payloads on fan-out** so that when a scene feeds more than one consumer each consumer
gets its own `Document` to mutate. Add a **MergeScenes** node that folds N SCENE inputs into one
`Document` (wrapping gltf-transform's document-merge). Placement of the merged parts is done with the
existing **SetProperty** node at `/nodes/i/translation|rotation|scale` from slice 03 — the selector
mechanism is the transform tool, so there is no separate Transform block.

## User Stories

1. As a pipeline author, I want a MergeScenes node that takes several SCENE inputs and outputs one
   combined SCENE, so that I can assemble a deliverable from parts.
2. As a pipeline author, I want to merge two imported models into one scene and export it, so that I
   can compose (e.g.) a chair into a room.
3. As a pipeline author, I want to add more inputs to MergeScenes as I add more parts, so that
   composition scales with my content.
4. As a pipeline author, I want to position each part after merging (translate/rotate/scale) via
   SetProperty, so that parts land where they belong instead of overlapping at the origin.
5. As a pipeline author, I want to fan one imported scene out to two branches that each edit it
   differently, so that I can produce variants or recombine edits.
6. As a pipeline author, I want branches that edit a shared upstream scene to not corrupt each other,
   so that my diamond-shaped graph produces the result I expect.
7. As a pipeline author, I want a shared upstream block to be computed once per build, so that
   expensive imports/operations aren't redone for every consumer.
8. As a pipeline author, I want composition to work with any SCENE source (glTF, USD, operator
   output), so that I can mix inputs of different origins.
9. As a pipeline author, I want the composition nodes grouped in the palette, so that I can find merge
   and placement quickly.

## Implementation Decisions

- **Evaluate-once.** Give the pull evaluator a per-build memo so each block is evaluated a single time
  and its output reused by every downstream consumer. This closes the "diamond re-evaluates upstream"
  gap in the current `_evaluateBlockAsync` (which has no visited-set/cache).
- **Copy-on-fan-out for SCENE.** When a SCENE output connection point feeds more than one connection,
  hand each consumer an independent clone of the `Document` (via gltf-transform's document clone/copy)
  so in-place mutations in one branch can't affect another. Scalar/immutable payloads (NUMBER, STRING,
  JSON) are shared without cloning. This is what makes the retained in-place mutation style (slices
  02–03) safe in a DAG.
- **MergeScenes.** N SCENE inputs → 1 SCENE output, wrapping gltf-transform's document-merge to fold
  each source `Document` into a target. Unbounded inputs use the existing `_registerInput` support.
- **Placement via SetProperty.** No Transform block. Composition graphs position parts with SetProperty
  at `/nodes/i/translation|rotation|scale`, reusing the slice-03 converter. This is the concrete payoff
  of ADR 0003.
- **Ordering/roots.** MergeScenes preserves each source's node hierarchy under the combined scene's
  roots so that per-source placement pointers remain addressable after merge.

## Testing Decisions

- **Reuse the `buildAsync()` SCENE seam.** Tests build a DAG, export, re-parse, and assert on the
  combined output — external behaviour only.
- **Diamond non-interference (the key regression):** import → fan out to two SetProperty branches
  (branch A sets material red, branch B sets a node's translation) → MergeScenes → export; assert
  *both* edits are present and neither branch stomped the other. This single test exercises both
  evaluate-once and copy-on-fan-out through their observable contract (rather than counting internal
  evaluations).
- **Merge test:** two imports → MergeScenes → export; assert the output Document contains the union of
  meshes/materials/nodes from both sources.
- **Placement test:** import → SetProperty(`/nodes/0/translation`, `[x,y,z]`) → export; assert the
  node moved to the expected transform.
- Prior art: milestone-1 roundtrip/compression tests and the slice-03 SetProperty tests.

## Out of Scope

- Multiple export sinks / multi-output graphs.
- Conditional or branching evaluation (if/switch), loops, or subgraphs.
- Smart layout, collision avoidance, or auto-placement — placement is manual via SetProperty.
- Cross-source instancing/dedup during merge (run the slice-02 dedup operator afterwards if wanted).
- Deep USD/glTF scene-graph reconciliation beyond concatenating hierarchies under shared roots.

## Further Notes

- Copy-on-fan-out is the deliberate counterpart to keeping blocks mutation-based: rather than rewrite
  every block to be pure, we isolate branches by cloning at the fork. It's the cheaper correct choice
  at POC scale and is recorded as the resolution of the "in-place mutation + fan-out" cliff noted
  during design.
- Clone cost is real for large scenes; acceptable now. If it ever bites, the escape hatch is
  copy-on-write, but that's premature today.
- After this slice the graph is a genuine DAG, which is the precondition for the extract-and-recompose
  showcase in slice 06.
