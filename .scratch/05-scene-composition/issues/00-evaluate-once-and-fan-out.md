# 00 — Evaluate-once + fan-out-capable connections (make the graph a DAG)

Status: ready-for-agent

## Parent

`.scratch/05-scene-composition/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**evaluate-once / copy-on-fan-out**: "Each block is evaluated a single time per `buildAsync()`
(evaluate-once); when a SCENE output feeds more than one consumer, each consumer gets an independent
`Document` clone (copy-on-fan-out) … Scalar payloads are shared, not cloned") · Decision:
`docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (the evaluator moves an opaque value along a
kind-typed wire; nothing here needs a per-kind capability object).

## Goal

Turn the pull evaluator from a tree-walker into a **DAG-correct** one by doing two things that only
matter together. First, make an output connection point able to feed **more than one** input, so a
fan-out (a scene feeding two branches) is representable and survives save/load — today
`connectedPoint` is a single slot and the second wire silently overwrites the first. Second, give
`buildAsync()` a **per-build memo** so each block is evaluated exactly once and its output is reused by
every consumer, instead of the current recursion that re-walks a shared upstream block once per branch.
After this, a diamond graph evaluates each block once and both branches read the same computed output —
the structural precondition for MergeScenes (issue 02) and copy-on-fan-out (issue 01).

## Why this is its own slice

It is the pure graph/evaluator plumbing under the whole milestone, with no new block and no new
gltf-transform code. Landing it first means MergeScenes and copy-on-fan-out build on a graph that can
actually express and correctly evaluate a diamond. Mutation-safety across branches is deliberately the
**next** issue (01): this issue makes fan-out *representable and evaluated once*; it does **not** clone
payloads, so its own tests fan out to consumers that only **read** (or export) the shared scene.

## KISS ground rules (read first)

- **No caching framework.** The memo is a single `Map<NodeAssetBlock, Promise<void>>` scoped to one
  `buildAsync()` call and passed down the recursion — not a field on the asset, not a global, not an
  invalidation system. A fresh build starts with a fresh memo.
- **Key the memo by a Promise so concurrent fan-in dedupes.** Upstream blocks are already evaluated with
  `Promise.all`; two branches can reach the same shared block at the same time. Store the *promise* of a
  block's evaluation and `await` the existing one — do not evaluate twice and do not add locks.
- **Do not clone or copy payloads here.** Copy-on-fan-out is issue 01. Here the shared output value is
  simply read by each consumer. This issue's tests must not depend on cloning.
- **Minimal model change, keep the invariants.** An input still has exactly **one** source; only the
  **output** side becomes one-to-many. Keep the "an input must connect to an output", type-equality, and
  "a required input left unconnected is an error" rules exactly as they are.
- **Don't touch the payload kinds or the enum** (ADR 0002). This is evaluator + connection plumbing,
  not a payload change.

## What to build

- **Output → many inputs (connection model).** In `connection/nodeAssetConnectionPoint.ts`, let an output
  track a **list** of connected inputs while an input keeps its single source. Sketch:

  ```ts
  // input keeps: connectedPoint: Nullable<NodeAssetConnectionPoint>  (its one source output)
  // output gains: the set of inputs it feeds
  public get connectedPoints(): ReadonlyArray<NodeAssetConnectionPoint> { /* inputs this output feeds */ }

  // connectTo (from the normalized output side): push instead of overwrite
  //   this._connectedPoints.push(other); other.connectedPoint = this;
  // isConnected: input -> connectedPoint !== null; output -> connectedPoints.length > 0
  // disconnect(): input clears its one link and removes itself from the output's list;
  //               output.disconnect() clears every input it feeds, symmetrically.
  ```

  Preserve `connectedPoint` semantics for **inputs** (used all over evaluation and tests). For outputs,
  replace the single `connectedPoint` reads with the list.
- **Serialize/Parse every fan-out edge.** `NodeAsset.serialize()` already iterates `block.outputs` —
  emit **one connection per connected input** in the output's list (today it emits at most one).
  `NodeAsset.Parse` is unchanged (it re-wires per recorded connection) but must round-trip a graph where
  one output feeds several inputs. `removeBlock` must disconnect an output from **all** its inputs.
- **Evaluate-once memo.** In `nodeAsset.ts`, thread a per-build memo through `_evaluateBlockAsync` so a
  block already being (or having been) evaluated is awaited, not re-run. Sketch:

  ```ts
  public async buildAsync(): Promise<Uint8Array> {
      const evaluated = new Map<NodeAssetBlock, Promise<void>>();
      await this._evaluateBlockAsync(exportBlock, evaluated);
      // ...
  }

  private async _evaluateBlockAsync(block, evaluated): Promise<void> {
      const existing = evaluated.get(block);
      if (existing) { return existing; }            // reuse the single evaluation
      const promise = this._doEvaluateBlockAsync(block, evaluated);
      evaluated.set(block, promise);                // memo BEFORE awaiting, so fan-in dedupes
      return promise;
  }
  // _doEvaluateBlockAsync: the current body (build upstreams, propagate input.value = upstream.value,
  // then block._buildBlockAsync()), recursing with the same `evaluated` map.
  ```

- **Update the existing tests that assume a single output link.** `test/unit/nodeAsset.test.ts` asserts
  `importer.output.connectedPoint` and `parsedImporter.output.connectedPoint` — migrate these to the new output
  accessor (e.g. `output.connectedPoints[0]`) while keeping input-side `connectedPoint` assertions.
  `test/unit/nodeAssetConnectionPoint.test.ts` likewise.

## Tests

Headless `buildAsync()` is the primary seam (prior art: `test/unit/nodeAsset.test.ts`,
`operatorPipeline.test.ts`):

- **Fan-out is representable and round-trips** — wire one output to two inputs; assert the output reports
  **two** connected inputs and both inputs report that output as their source; `serialize()` emits both
  edges; `NodeAsset.Parse` restores both (build the parsed graph without re-wiring).
- **Evaluate-once (the US7 regression)** — build a diamond where a single upstream block fans out to two
  branches that reconverge at the terminal export. Assert the shared block is evaluated **once**: use an
  observable counter — e.g. a small test block that increments a build counter in `_buildBlockAsync`, or
  spy on a real block's build hook — and assert it ran a single time even though two branches consume it.
- **Both consumers see the shared output** — with the diamond above (branches that only read/pass the
  scene through), assert the exported result reflects the shared upstream once and the build succeeds.
- **Linear graphs unchanged** — the existing import → (operator) → export and save/load tests stay green
  (each block still evaluated once, now via the memo rather than by tree shape).
- **Editor Playwright** only if drawing a second wire from one output port needs interaction coverage;
  prefer the headless seam. Existing editor tests stay green.

## Acceptance criteria

- [ ] An output connection point can feed **multiple** inputs; an input still has exactly one source.
      `connectTo` pushes (does not overwrite), `disconnect`/`removeBlock` clear every edge symmetrically,
      and `isConnected` is correct on both sides.
- [ ] `serialize()` emits one connection per fanned-out edge and `NodeAsset.Parse` round-trips a graph
      where one output feeds several inputs.
- [ ] `buildAsync()` evaluates each block exactly once per build via a per-build memo keyed so concurrent
      fan-in dedupes; a shared upstream block in a diamond builds a single time.
- [ ] **No** payload cloning/copy-on-fan-out is done here (deferred to issue 01); no caching framework,
      global cache, or invalidation is introduced — just a per-build memo.
- [ ] Existing `nodeAsset` / connection-point tests are migrated to the new output accessor and pass;
      linear roundtrip + operator-chain tests stay green.
- [ ] New headless tests cover fan-out representation + round-trip and the evaluate-once diamond; they
      pass. `lint:check` + `format:check` pass.

## Blocked by

- **Slice-02 scene spine** (SCENE rename, block self-registration, operators) — **landed on `dev`**. No
  new-code block here.
- **Unblocks** issue 01 (copy-on-fan-out, which clones on the fan-out this issue makes representable) and
  is the structural precondition for the issue 03 diamond E2E.

## Note for whoever merges

This is the one issue that changes the connection-point shape, so it touches the same files as any other
connection/serialization work in the slice. Land it before 01 and before the issue 03 capstone. The
intermediate state after this lands (fan-out works, payloads still shared) is **read-safe** but not yet
mutation-safe across branches — that is exactly what 01 closes; don't advertise fan-out-with-edits until
01 lands.
