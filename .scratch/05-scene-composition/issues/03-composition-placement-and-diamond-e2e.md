# 03 — Composition capstone: placement via SetProperty + diamond non-interference E2E

Status: ready-for-agent

## Parent

`.scratch/05-scene-composition/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**MergeScenes**, **GetProperty / SetProperty**: "SetProperty writes a value at a pointer into a SCENE …
together they subsume set-extras, placement, and … texture extraction", **selector / pointer**,
**evaluate-once / copy-on-fan-out**) · Decisions:
`docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (placement is the concrete payoff
of the generic selector — no bespoke Transform node),
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (everything composes on the SCENE `Document`).

## Goal

Tie the milestone together and prove it. Two things, both **reuse** — no new block. First, **placement**:
position each merged part by writing `/nodes/i/translation | rotation | scale` with the existing
**SetProperty** block (slice 03), so parts land where they belong instead of overlapping at the origin —
the concrete payoff of ADR 0003, with the selector mechanism *as* the transform tool. Second, the
milestone's **key regression**: a diamond graph — import → fan out to two SetProperty branches → merge →
export — where both edits survive and neither branch stomps the other, exercising evaluate-once (00),
copy-on-fan-out (01), and MergeScenes (02) through their observable contract. Ship a small premade
composition graph as the human-facing demonstration.

## Why this is its own slice

Placement adds no code (SetProperty + the pointer→accessor converter already resolve node TRS), and the
diamond E2E depends on **everything** — 00, 01, 02, and slice-03's Selector/converter/SetProperty — so it
is naturally the last, integrative issue rather than something owned by any single mechanism. Landing the
end-to-end regression here keeps 00/01/02 independently reviewable with focused tests while giving the
milestone one authoritative "the diamond works" test and a runnable example.

## KISS ground rules (read first)

- **Reuse, do not build.** Placement is `SetProperty` on `/nodes/i/translation | rotation | scale`
  (converter already maps node TRS). **Do not** add a Transform/Placement block, a matrix node, or a
  vector-math block — ADR 0003 explicitly cut the bespoke transform node. If a gap surfaces (e.g. the
  converter doesn't cover `rotation`/`scale`), fix it in slice-03's converter, not with a new block.
- **This issue is mostly tests + one small example.** No new runtime block. The only product change
  beyond tests is the premade graph and any palette-ordering polish so "merge and placement" are easy to
  find together (US9); keep that to category ordering/labels, not a palette rewrite.
- **Assert on exported bytes, not internals.** Build → export → re-parse → assert. The diamond test must
  prove non-interference through the **output** (both edits present), not by counting evaluations or
  reading block state.
- **One export sink.** Multi-output graphs are out of scope; the diamond reconverges at a single
  MergeScenes → ExportGLTF.

## What to build

- **Placement in a composition graph (US4).** A graph that merges parts and positions each via
  SetProperty at its post-merge node index. Sketch (wiring, not new API):

  ```text
  ImportGLTF(chair) ─┐
                     ├─ MergeScenes ─ SetProperty(/nodes/1/translation, [2,0,0]) ─ ExportGLTF
  ImportGLTF(room) ──┘        (Selector emits the pointer; a JsonLiteral emits the value)
  ```

  Placement pointers are authored with a **Selector** (slice-03 issue 01) and values fed by a
  `JsonLiteral` (slice-03 issue 00); the merged part's index is addressable because MergeScenes preserves
  each source's hierarchy under the combined roots (issue 02).
- **The diamond non-interference E2E (the key regression).** One import fanned out to two branches that
  edit the scene, recombined and exported. Two forms matter:
  - *Mixed edits (the PRD's illustration).* Branch A reddens a material, branch B moves a node; assert
    **both** kinds of edit are present after merge.

    ```text
    ImportGLTF ─┬─ SetProperty(/materials/0/emissiveFactor, [1,0,0]) ─┐
                └─ SetProperty(/nodes/0/translation, [5,0,0])         ─┴─ MergeScenes ─ ExportGLTF
    ```
  - *Same-pointer conflict (what actually proves isolation).* Both branches write the **same** pointer to
    **different** values. With in-place mutation the second branch clobbers the first (last-writer-wins);
    copy-on-fan-out gives each branch its own copy, so — because MergeScenes preserves each source under the
    combined roots (issue 02) — the exported scene holds **both** values on two copies of the node.

    ```text
    ImportGLTF ─┬─ SetProperty(/nodes/0/translation, [5,0,0]) ─┐
                └─ SetProperty(/nodes/0/translation, [0,5,0]) ─┴─ MergeScenes ─ ExportGLTF
    ```

  Together they exercise evaluate-once + copy-on-fan-out + merge through their observable contract. The
  mixed form covers the "both edits survive" story; the same-pointer form is the one that bites if isolation
  regresses.
- **A premade composition graph.** Add a small saved/example graph (alongside the milestone-1 premade
  graph / e2e demonstration) that a user can load to see merge + placement working — the runnable version
  of the placement sketch above. Wire it so it builds headlessly.
- **Palette discoverability polish (US9).** Ensure the **Composition** category (MergeScenes, issue 02)
  and the placement nodes (Selector / SetProperty under **Selectors**, slice-03) are presented so "merge
  and placement" are easy to find together — category ordering/labels only.

## Tests

Headless `buildAsync()` is the primary seam (prior art: milestone-1 roundtrip/compression tests in
`test/unit/nodeAsset.test.ts`; the slice-03 SetProperty node-transform test):

- **Placement (US4)** — import → SetProperty(`/nodes/0/translation`, `[x,y,z]`) → export; re-parse and
  assert the node moved to the expected transform. Then the composition form: two imports → MergeScenes →
  SetProperty on a merged part's `/nodes/i/translation` → export; assert that part moved and the other did
  not. (Cover `rotation`/`scale` briefly too, since placement is translate/rotate/scale.)
- **Diamond non-interference (the milestone's key regression)** — two forms of the diamond above:
  - *Mixed edits* (branch A `/materials/0/emissiveFactor = [1,0,0]`, branch B `/nodes/0/translation =
    [5,0,0]`) → MergeScenes → export; re-parse and assert **both** a red material and a moved node are
    present. Covers the "both edits survive" story.
  - *Same-pointer conflict* (branch A `/nodes/0/translation = [5,0,0]`, branch B `= [0,5,0]`) → MergeScenes
    → export; assert **both** translations survive as independent merged copies. This is the true
    regression net: with in-place mutation (no copy-on-fan-out) the second branch clobbers the first, only
    one value survives, and the test **fails** — proving issues 00/01 are load-bearing.
- **Premade composition graph builds** — load the example graph and `buildAsync()` it; assert it exports
  non-empty bytes with the expected merged + placed result. Save/load round-trips it.
- **Editor Playwright (split explicitly)** — the parts that can only be shown in the editor: authoring the
  composition graph on the canvas (drop MergeScenes from the **Composition** category, add a second input,
  wire two imports, attach a Selector + SetProperty for placement) and confirming the palette groups merge
  + placement discoverably. Keep the build-correctness assertions in the headless seam; use Playwright
  only for the canvas/palette interaction.

## Acceptance criteria

- [ ] Placement is done with the existing **SetProperty** on `/nodes/i/translation | rotation | scale`
      (via a Selector-authored pointer); **no** Transform/Placement/vector block is added (ADR 0003).
- [ ] A headless test asserts a merged part is repositioned via SetProperty and other parts are unaffected.
- [ ] The **diamond non-interference** E2E (import → two SetProperty branches → MergeScenes → export)
      asserts edits survive through the re-parsed output; its **same-pointer conflict** form fails without
      copy-on-fan-out and passes with it.
- [ ] A small premade composition graph is added, builds headlessly to the expected merged + placed
      result, and round-trips through save/load.
- [ ] Palette presents **Composition** (merge) and placement (Selectors) so they are easy to find together
      (US9) — ordering/labels only, no palette rewrite.
- [ ] Editor Playwright covers authoring the composition graph + palette grouping; build correctness stays
      in the headless seam. `lint:check` + `format:check` pass.

## Blocked by

- **Issue 00 (evaluate-once + fan-out)** — the diamond needs the shared import evaluated once and fanned
  out. **Hard block.**
- **Issue 01 (copy-on-fan-out)** — the diamond needs the two branches isolated so both edits survive.
  **Hard block.**
- **Issue 02 (MergeScenes)** — the diamond and the placement composition reconverge/assemble through it.
  **Hard block.**
- **Slice-03 — Selector (`01-selector-node`), pointer→accessor converter (`02-pointer-to-accessor-converter`),
  and SetProperty (`04-set-property-block`)** in `.scratch/03-scalar-wires-and-selectors/issues/` —
  placement reuses the converter's node-TRS mapping, the Selector as pointer source, and SetProperty as
  the write. **Hard block** (these must be implemented in code; the issue files are on `dev`, the code is
  planned).

## Note for whoever merges

This is the milestone's closing integration issue: land it after 00/01/02 and after slice-03's
selector triad is implemented. Its diamond test is the single authoritative regression for the whole
"graph is now a correct DAG" story — keep it green.
