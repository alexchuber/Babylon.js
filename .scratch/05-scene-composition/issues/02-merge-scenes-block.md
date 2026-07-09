# 02 — MergeScenes block (fold N SCENE inputs into one combined SCENE)

Status: ready-for-agent

## Parent

`.scratch/05-scene-composition/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**MergeScenes**: "A composition block folding N SCENE inputs into one SCENE (wrapping gltf-transform's
document merge), preserving each source's hierarchy under the combined roots so per-source pointers stay
addressable") · Decision:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (a middle/composition block only ever sees
`Document`s; format bytes live only at the import/export boundary).

## Goal

Add the **MergeScenes** block: several **SCENE** inputs in, one combined **SCENE** out. It folds each
source `Document` into one target via gltf-transform's `mergeDocuments`, preserving each source's node
hierarchy under the combined scene's roots so that per-source placement pointers (`/nodes/i/*`) stay
addressable after the merge. The input count is **variadic** — a user adds more inputs as they add more
parts — so composition scales with content. This is the one new block in the milestone and the thing
that turns a single-line graph into an assembly of parts (chair into a room, product from components).

## Why this is its own slice

It is a single self-contained block modelled on the existing operator blocks, with no dependency on the
evaluator changes (issues 00/01): the block itself just reads its inputs and writes a merged output.
`mergeDocuments` copies each source **into** the target without mutating the source, so MergeScenes is
safe even before copy-on-fan-out lands — it can be built and tested in parallel with 00/01. The
diamond that combines merge with fan-out edits is the issue 03 capstone.

## KISS ground rules (read first)

- **Model on an existing block, no base class.** Extend `NodeAssetBlock`, register SCENE inputs +
  one SCENE output, do the work in `_buildBlockAsync`, dynamic-`import` gltf-transform inside the body,
  `RegisterBlock(...)` beside the class, export from `src/index.ts`. Follow `dedupBlock.ts` /
  `flattenBlock.ts` for the shape. **Do not** invent a "composition base" or a generic N-ary block
  framework.
- **Use the v4 API — `Document#merge` is gone.** Merge with `mergeDocuments(target, source)` from
  `@gltf-transform/functions` (v4 removed `Document.prototype.merge`). It folds `source` into `target`
  **without affecting the source**, so do not clone inputs defensively here (fan-out isolation is the
  evaluator's job, issue 01).
- **Bytes only at the boundary.** MergeScenes works entirely on `Document`s (ADR 0001); it never sees or
  produces glb bytes. No `WebIO`, no import/export logic.
- **Merge into a fresh target, in input order.** Create one empty `Document` and fold every connected
  input into it in port order, so the result is deterministic and independent of any input's identity.
- **No dedup/instancing during merge** (PRD out-of-scope). A user runs the existing `DedupBlock` after
  MergeScenes if they want cross-source dedup. Preserve each source's roots/hierarchy; don't reconcile
  scene graphs.

## What to build

- **`MergeScenes`** — a variadic SCENE→SCENE block. Sketch:

  ```ts
  // src/Blocks/mergeScenes.ts
  export class MergeScenes extends NodeAssetBlock {
      public static override ClassName = "MergeScenes";
      public readonly output: NodeAssetConnectionPoint;    // SCENE
      // variadic SCENE inputs: input0, input1, ... (see "variadic inputs" below)

      public override async _buildBlockAsync(): Promise<void> {
          const { Document } = await import("@gltf-transform/core");
          const { mergeDocuments } = await import("@gltf-transform/functions");
          const target = new Document();
          for (const input of this.inputs) {
              const source = input.value as Document | null;
              if (!source) { continue; }                  // tolerate/skip an unwired optional input
              mergeDocuments(target, source);             // folds source INTO target, source untouched
          }
          this.output.value = target;
      }
  }
  RegisterBlock(MergeScenes.ClassName, (name, asset) => new MergeScenes(name, asset));
  ```

  Confirm the exact `mergeDocuments` shape against the installed `@gltf-transform/functions@^4.4.1`
  (`mergeDocuments(target, source, resolve?)`; copies source into target). If the combined roots need
  explicit parenting to keep `/scenes/0` addressable, do it after folding — that is the
  "preserve hierarchy under the combined roots" requirement.

- **Variadic inputs — resolve the evaluator's "all inputs must be connected" invariant.** The evaluator
  throws for **any** unconnected input, so a bare "spare" input would break the build. Pick the minimal
  approach and state it in the PR:
  - **Preferred (no evaluator change):** the block owns a dynamic list of SCENE inputs and the editor
    grows it by one when the last free input is connected and prunes trailing unconnected inputs, so at
    build time every input present is connected. Start with two inputs. Persist the input count through
    `serialize`/`_deserialize` so a saved N-input merge reloads with N inputs and its wiring.
  - **Alternative (tiny evaluator tweak):** introduce an `isOptional` flag on input connection points and
    have the evaluator **skip** unconnected optional inputs instead of throwing; MergeScenes marks its
    inputs optional. Only take this route if dynamic input management proves fiddly; if you do, coordinate
    with issue 00 (same evaluator file) and keep the flag minimal (no new abstraction).

  Either way, headless tests wire exactly the inputs they use, and `_buildBlockAsync` merges all connected
  inputs.
- **Editor exposure — a Composition palette category.** Add `CompositionCategory = "Composition"` (with a
  distinct header color) in `blockCatalog.ts`, and a `mergeScenesDescriptor.ts` under `blockDescriptors/`
  that self-registers MergeScenes there, plus an "add input" affordance / property section for the
  variadic inputs. This is what satisfies "composition nodes grouped in the palette" (US9). Follow
  `dedupBlockDescriptor.ts` for the descriptor shape and `OperatorCategory` for the category pattern.

## Tests

Headless `buildAsync()` is the primary seam — build a graph, export, re-parse the output `Document`, and
assert on the combined result (prior art: `test/unit/nodeAsset.test.ts` roundtrip,
`test/unit/operatorPipeline.test.ts`; build in-code source Documents like the per-block tests do):

- **Merge two imports (US1, US2)** — two ImportGLTF sources (distinct meshes/materials) → MergeScenes →
  ExportGLTF; re-parse and assert the output contains the **union** of meshes / materials / nodes from
  both sources (counts add up; nothing dropped).
- **Three-plus inputs (US3)** — a three-input merge produces the union of all three; assert the block
  supports adding inputs and that a saved three-input merge round-trips through `serialize` /
  `NodeAsset.Parse` with all wiring intact.
- **Any SCENE source (US8)** — merge a plain glTF import with the output of an **operator** block
  (e.g. import → CenterBlock → MergeScenes ← import) and assert the union still exports; MergeScenes is
  agnostic to how each SCENE was produced. (Include a USD source too if `ImportUSDBlock` is available.)
- **Sources are not mutated** — after merge, each upstream input `Document` still has its original
  contents (proves `mergeDocuments` copied into the target).
- **Hierarchy preserved** — the merged output keeps each source's node hierarchy under the combined
  scene's roots, so a `/nodes/i/*` pointer into a merged part resolves (the seam issue 03's placement
  relies on).
- **Editor Playwright** — only for the "add another input" palette/port interaction and the Composition
  category grouping if not covered headlessly; prefer the headless seam for the merge behaviour.

## Acceptance criteria

- [ ] `MergeScenes` exists in `src/Blocks/`, extends `NodeAssetBlock`, exposes a **variadic** set of SCENE
      inputs and one SCENE output, modelled on the existing operator blocks (no base class / N-ary
      framework).
- [ ] `_buildBlockAsync` folds every connected input into a fresh target via `mergeDocuments` from
      `@gltf-transform/functions` (not the removed `Document#merge`), in port order, and outputs the target;
      inputs are not mutated.
- [ ] The variadic-input approach is chosen and documented (dynamic input list, or minimal optional-input
      tolerance), respects the evaluator's connected-input invariant, and round-trips the input count +
      wiring through save/load.
- [ ] Each source's hierarchy is preserved under the combined roots so per-source `/nodes/i/*` pointers
      stay addressable; no cross-source dedup/instancing is performed.
- [ ] The block self-registers, is exported from `src/index.ts`, and appears under a **Composition**
      palette category (US9).
- [ ] Headless tests cover two-source union, three-input + save/load, mixed-source (glTF + operator)
      merge, source-not-mutated, and hierarchy-preserved; they pass. `lint:check` + `format:check` pass.

## Blocked by

- **Slice-02 scene spine** (SCENE type, block self-registration, operators) — **landed on `dev`**.
- **Independent of issues 00/01** — `mergeDocuments` copies sources into the target, so MergeScenes is
  correct even before copy-on-fan-out; it can be built in parallel. The **diamond** that combines merge
  with fanned-out edits is exercised in issue 03, which needs 00, 01, and slice-03.

## Note for whoever merges

If issue 00's optional-input alternative is chosen for variadic inputs, this issue and 00 touch the same
evaluator file — sequence accordingly. If the dynamic-input-list approach is chosen, this issue is fully
self-contained. Either way, the Composition palette category added here is where issue 03 expects merge +
placement to be discoverable together.
