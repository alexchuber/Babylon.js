# 01 — Copy-on-fan-out for SCENE payloads (isolate branches that edit a shared scene)

Status: ready-for-agent

## Parent

`.scratch/05-scene-composition/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**evaluate-once / copy-on-fan-out**: "when a SCENE output feeds more than one consumer, each consumer
gets an independent `Document` clone (copy-on-fan-out) so in-place mutations don't stomp across branches.
Scalar payloads are shared, not cloned") · Decisions:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (the SCENE payload is a gltf-transform
`Document`; cloning it is a gltf-transform operation),
`docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (the wire is a kind + opaque value; the kind is
what tells the evaluator whether to clone).

## Goal

Make fan-out **mutation-safe**. Now that an output can feed several inputs (issue 00) and blocks still
mutate the SCENE `Document` in place (slices 02–03), two branches editing the same upstream scene would
stomp each other because they share one `Document`. Fix it at the fork: when a **SCENE** output feeds
more than one consumer, hand each consumer its **own** `cloneDocument(source)` so in-place edits stay
local to a branch; scalar/immutable payloads (NUMBER, STRING, JSON, BYTES) are shared as-is. This is the
deliberate counterpart to keeping blocks mutation-based — isolate at the fork rather than rewrite every
block to be pure.

## Why this is its own slice

It is a single, well-scoped correctness rule that rides on issue 00's fan-out model and is the piece that
makes the retained in-place-mutation style safe in a DAG. Keeping it separate from 00 lets the fan-out
plumbing land and be reviewed on its own, and lets the clone rule be verified by a focused test that a
fanned-out SCENE yields independent documents — without dragging in MergeScenes. The full user-facing
diamond (two SetProperty branches recombined and exported) is the issue 03 capstone.

## KISS ground rules (read first)

- **Clone only SCENE, only on real fan-out.** Branch on the connection point **kind**: SCENE payloads
  are cloned; NUMBER / STRING / JSON / BYTES are passed by reference (they are immutable-by-convention
  scalars/opaque bytes). Only clone when an output feeds **more than one** input — a single consumer
  keeps sharing the one `Document` (no wasted clone on every linear edge).
- **Use the v4 API — `Document#clone` is gone.** Deep-copy with `cloneDocument(source)` from
  `@gltf-transform/functions` (v4 removed `Document.prototype.clone`). **Do not** hand-roll a copy or
  reach for a removed method.
- **Keep gltf-transform out of the generic evaluator (ADR 0001).** The evaluator must not `import`
  gltf-transform directly. Put the SCENE clone behind a tiny helper module (e.g.
  `src/evaluation/fanOutCopy.ts`) that dynamic-`import`s `cloneDocument`; the evaluator calls a
  kind-aware `CloneForFanOutAsync(type, value)` that returns a clone for SCENE and the value unchanged for
  everything else. gltf-transform stays confined to that one helper (the block-body rule's evaluator-side
  analog).
- **No copy-on-write, no ref-counting, no clone cache.** A straight clone-per-extra-consumer is the
  correct cheap choice at POC scale (PRD "Further Notes"). COW is the documented escape hatch **only if**
  clone cost ever bites — not now.
- **Don't change block code.** Blocks keep mutating in place; this issue changes only how the evaluator
  hands values to consumers.

## What to build

- **A kind-aware fan-out copy helper.** New `src/evaluation/fanOutCopy.ts` (or similar) owning the only
  evaluator-side gltf-transform touch. Sketch:

  ```ts
  // src/evaluation/fanOutCopy.ts
  export async function CloneForFanOutAsync(type: NodeAssetConnectionPointType, value: unknown): Promise<unknown> {
      if (type !== NodeAssetConnectionPointType.SCENE || value == null) {
          return value; // scalars / bytes / null share by reference
      }
      const { cloneDocument } = await import("@gltf-transform/functions");
      return cloneDocument(value as Document);
  }
  ```

- **Clone at propagation when the output fans out.** In `nodeAsset.ts`, where the evaluator currently does
  `input.value = upstream.value`, clone per consumer when the upstream output has more than one connected
  input. Sketch (building on issue 00's `connectedPoints`):

  ```ts
  for (const { input, upstream } of connections) {
      const fansOut = upstream.connectedPoints.length > 1;
      input.value = fansOut
          ? await CloneForFanOutAsync(upstream.type, upstream.value) // each consumer gets its own copy
          : upstream.value;                                          // sole consumer shares
  }
  ```

  Every consumer of a fanned-out SCENE gets its **own** clone (the PRD's "each consumer gets an
  independent clone"), so no branch holds the canonical evaluated `Document` that another might mutate.

## Tests

Headless is the primary seam. Because the graph has a **single export sink** (multi-sink is out of
scope), branch isolation is proven at the evaluator/value level here; the full recombined diamond is
issue 03.

- **SCENE fan-out yields independent documents (the core rule)** — build a source block whose output
  feeds two consumer inputs; evaluate; assert the two inputs received **different** `Document` instances,
  and that mutating one branch's `Document` (e.g. add a node / set a material factor) leaves the other
  branch's `Document` unchanged. Prior art for value-level assertions:
  `test/unit/nodeAssetConnectionPoint.test.ts`, `test/unit/nodeAsset.test.ts`.
- **Scalars are shared, not cloned** — a NUMBER / STRING / JSON output fanned to two inputs delivers the
  **same** reference to both (no clone); assert identity to lock in "scalars are shared".
- **Single consumer is not cloned** — a plain linear SCENE edge (one consumer) passes the **same**
  `Document` through, so existing operator-chain behaviour and the milestone-1 roundtrip are unchanged
  (assert identity + existing tests stay green).
- **Two mutating branches don't interfere (evaluator level)** — fan a SCENE out to two different operator
  blocks (e.g. one `CenterBlock`, one `WeldBlock`) and assert each branch's output `Document` reflects
  only its own operator, not the other's. (End-to-end recombine-and-export is issue 03's diamond.)
- **Editor Playwright** — none required; this is pure runtime. Existing editor tests stay green.

## Acceptance criteria

- [ ] When a SCENE output feeds more than one input, each consumer receives an independent
      `cloneDocument(source)` copy; a single-consumer SCENE edge shares the same `Document` (no clone).
- [ ] NUMBER / STRING / JSON / BYTES payloads are shared by reference on fan-out (never cloned).
- [ ] The clone uses `cloneDocument` from `@gltf-transform/functions` (not the removed `Document#clone`),
      and gltf-transform is imported **only** inside the fan-out copy helper — the generic evaluator does
      not import gltf-transform (ADR 0001).
- [ ] No copy-on-write / ref-counting / clone cache is introduced; block code is unchanged.
- [ ] Headless tests prove SCENE fan-out isolation (mutate one branch, other unaffected), scalar sharing,
      single-consumer no-clone, and two-operator branch non-interference; they pass.
- [ ] `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (evaluate-once + fan-out connections)** — this issue clones on the fan-out that 00 makes
  representable and reads the upstream output's consumer count (`connectedPoints`). **Hard block.**
- **Slice-02 scene spine** — landed on `dev`.
- The full user-facing diamond (two SetProperty branches → MergeScenes → export, assert both edits) lives
  in **issue 03**, which additionally needs issue 02 (MergeScenes) and slice-03 (Selector + SetProperty).

## Note for later slices

Clone cost is real for large scenes and is accepted at POC scale; if it ever bites, copy-on-write is the
recorded escape hatch (PRD). After 00 + 01 the graph is a genuine DAG — the precondition for the
extract-and-recompose showcase in slice 06.
