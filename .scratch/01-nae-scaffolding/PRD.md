# PRD: NodeAssets — Milestone 1 (NAE scaffolding)

Status: Milestone 1 complete — scaffolding shipped and the completion effort landed (see "PRD Addendum: Milestone 1 Completion" at the bottom). All completion slices (05, 07, 08, 09) resolved.

## What this is

NodeAssets is a small, node-based content pipeline for Babylon.js, plus a companion Fluent node
editor — the **Node Assets Editor (NAE)** — to author it. You build a graph of **blocks** that takes
a source asset in and produces a Babylon-ready asset out. It's inspired by the old "Polymorph" idea:
a shared, recombinant toolkit for the "messy middle" between creation assets (CAD, USD) and
consumption assets (glTF).

This document describes **milestone 1 as-built** — the scaffolding of the whole editor and runtime.
Later milestones (`02-…`, `03-…`) sit beside this one as their own `.scratch/NN-…/` efforts.

## Problem (the "messy middle")

Everyone preparing 3D content for the web hand-rolls the same one-off pipelines — decimate here,
compress textures there, convert formats somewhere else. They don't compose or reuse. NodeAssets is a
first, tiny step toward a shared, visual, composable way to assemble those steps and see the real
result.

## Milestone 1 — what shipped

The milestone is defined simply as:

- **Node Editor UI** — a fresh, fully-interactive Fluent node editor.
- **glTF in, glTF out** — import a `.glb`/`.gltf`, roundtrip it, export it back.
- **Draco + KTX2 compression** — real "middle" blocks that shrink geometry and textures.

Delivered as two packages that construct the *same* underlying objects — one as code, one visually:

1. A **runtime / code API** — `@babylonjs/node-assets` (`@dev/node-assets`). Construct a `NodeAsset`,
   add blocks, connect them, `buildAsync()` to get output bytes. Its nomenclature deliberately mirrors
   Babylon's other node systems (`NodeMaterial`, `SmartFilters`, `FlowGraph`) so it feels native.
2. A **visual node editor** — the Node Assets Editor (`@tools/node-assets-editor`), a fresh Fluent
   canvas (same component library / style as Inspector V2) that assembles the same graph by dragging
   blocks and wiring them, with a live 3D preview of the real exported asset, plus save / load.

### Blocks delivered

- **ImportGLTFBlock → ExportGLTFBlock** — the boundary blocks. Pick a `.glb`, roundtrip it through
  gltf-transform, get a `.glb` back and see it in the preview.
- **DracoCompressionBlock** — sits between import and export and tags the document for
  `KHR_draco_mesh_compression`; the geometry encode happens when the export block writes.
- **KTX2CompressionBlock** — compresses the document's textures to KTX2 / Basis Universal
  (`KHR_texture_basisu`) — ETC1S for color, UASTC for data textures — encoding inside the block.

The payload flowing along a glTF connection is a **gltf-transform `Document`, used directly** — no
wrapper, no "asset" / "capability" / "format" abstraction. gltf-transform lives only inside the block
bodies. The graph is linear; blocks are pull-evaluated from the terminal export block.

## The one hard rule (conventions)

The API's nomenclature and shape **mirror Babylon's existing node systems** so it feels native. The
canonical vocabulary for each domain now lives in its package glossary:

- Runtime / graph terms → `packages/dev/node-assets/CONTEXT.md`
- Editor terms → `packages/tools/nodeAssetsEditor/CONTEXT.md`
- How the two relate → root `CONTEXT-MAP.md`

Keep it KISS: repetition is fine; abstraction is earned later, if ever. No registry, no
format-abstraction layer, no per-node memoization — all considered and cut as premature.

## Scope

**In (milestone 1):** the node system; the four blocks above; `buildAsync()` roundtrip via
gltf-transform; the Fluent editor wired to the runtime with import / export / preview / save / load;
headless roundtrip + compression unit tests; editor Playwright coverage.

**Out:** anything beyond the above — see Deferred.

## Status / known gaps

- **Issue 05 (resolved):** the Draco decoder WASM failed to load under the editor's Vite dev server,
  which breaks in-browser import for every graph. Headless/unit paths are unaffected. This is now
  **Slice 1 of the Milestone 1 completion effort** (see the addendum) — fixed by serving the Draco
  WASM same-origin.

## Deferred / future (explicitly NOT in milestone 1)

Kept reachable but not built. When we build these, revisit the API *then* — don't pre-abstract today.

- **More transforms / operations** (dedup, weld, prune, LODs, material edits, metadata) — thin
  wrappers over gltf-transform functions, one block each.
- **Branching / multi-input / fan-out** — when added, mutating blocks must clone their input first
  (gltf-transform mutates in place), and `buildAsync` gains real dependency ordering. Today's graph is
  linear, so none of this exists yet.
- **Live-preview polish** — debounced rebuilds, superseding in-flight rebuilds, and
  waiting/rebuilding/done/errored indicators are now **in scope for the Milestone 1 completion effort**
  (see the addendum, Slice 3 / issue 08). Previewing any node's intermediate result and per-node
  memoization remain deferred.
- **Promoting the editor's node-graph framework** — the reusable canvas built for the NAE could later
  become the shared node editor for Babylon's other node tools (NME, NGE, NRGE, NPE). It is already
  kept free of NodeAssets/gltf-transform types for exactly this.
- **Other formats** (USD, images) + explicit conversion blocks — this is why connection points are
  typed even though there is only one type (`GLTF`) today.
- **Server-side / heavy operations** (Simplygon-class) behind the same block interface.

## Testing

Assert external behavior, not internals. The load-bearing runtime test: a `NodeAsset` of
ImportGLTFBlock → ExportGLTFBlock produces glb bytes that re-parse into a valid glTF (a genuine
gltf-transform read/write roundtrip); the Draco and KTX2 blocks add compression-declared, re-importable
roundtrips. Headless vitest, modeled on `packages/dev/lottiePlayer/test/unit`. Editor behavior
(import → export → preview) is covered by Playwright.

## Milestone-1 issues

- `issues/00-fluent-node-editor-skeleton.md` — the Fluent editor UI skeleton (dummy data). `resolved`.
- `issues/01-gltf-roundtrip-backend.md` — the runtime glTF import→export roundtrip. `resolved`.
- `issues/02-wire-editor-to-backend.md` — wire the editor to the runtime (import / export / preview /
  save / load). `resolved`.
- `issues/03-draco-compression-block.md` — the Draco compression block. `resolved`.
- Issue 04 (KTX2 compression block) — `resolved`; ticket file removed after completion.
- `issues/05-draco-decoder-wasm-in-editor.md` — **repurposed as Slice 1** of the completion effort:
  fix in-editor Draco WASM by serving it same-origin (`resolved`).
- `issues/06-milestone-1-cleanup.md` — this cleanup (rename slug, rewrite PRD as-built, split
  glossaries per package + root map). `resolved`.

### Milestone-1 completion issues (the addendum's slices)

- `issues/05-draco-decoder-wasm-in-editor.md` — **Slice 1**: fix in-editor Draco WASM. Blocked by: none.
- `issues/07-preview-via-viewer-v2.md` — **Slice 2**: preview via Babylon Viewer V2, docked
  bottom-right. Blocked by: none.
- `issues/08-auto-build-scheduler.md` — **Slice 3**: auto-build scheduler + spinner/error, replace
  manual build. Blocked by: none.
- `issues/09-premade-graph-and-e2e.md` — **Slice 4**: premade wired graph + BoomBox + Draco properties
  + e2e. Blocked by: 05, 07, 08.

Slices 1–3 run in parallel; Slice 4 fans them in.

---

# PRD Addendum: Milestone 1 Completion ("M1 done")

Status: resolved

This addendum defines the work to take Milestone 1 from "scaffolding shipped" to **done**. It stays in
this tracker (`01-nae-scaffolding`); its issues are numbered **07+**. Milestone 2 is a separate future
effort in its own `.scratch/02-…/` directory.

## Problem Statement

The NAE scaffolding shipped, but opening the editor doesn't demonstrate the pipeline. A user who opens
NAE sees two unconnected boxes (Import, Export) and an empty preview. To see anything happen they must
manually pick a file, wire the graph, and click a build/export button — and if they add the Draco
block, the in-browser import/export **crashes** because the Draco WASM can't load under the editor's
dev server (issue 05). The preview is a hand-rolled Babylon scene rather than the real Babylon Viewer,
so it isn't obviously "the true output." There is no build-on-change, the preview is docked in an
awkward corner, and export lives on a toolbar button separate from the node it belongs to. In short:
the editor doesn't yet **show itself working**.

## Solution

NAE opens to a complete, **premade wired pipeline** — Import → KTX2 → Draco → Export — with a real
sample model (BoomBox) already loaded. It **auto-builds on open** and shows the actual exported `.glb`,
re-imported into Babylon via the **Babylon Viewer V2**, in a preview docked **bottom-right**. Any edit
to the graph (add / remove / reorder a node, rewire, change a property, re-import) **rebuilds
automatically** — debounced so rapid edits collapse into one build, and latest-wins so a slow earlier
build can't clobber a newer preview. While a rebuild runs, a **spinner** covers the preview; if a build
fails, a **non-fatal error** shows in the preview area instead of crashing or leaving stale output.
Selecting the **Export node** and clicking **Export** in its properties downloads exactly the bytes on
display. The user can freely **add, remove, and reorder** the Draco and KTX2 nodes, and both are
**tweakable** from the properties pane. The in-browser Draco crash is fixed by serving its WASM
same-origin. The redundant manual build/run button is removed.

## User Stories

1. As a NAE user, I want the editor to open to a complete, wired example pipeline (Import → KTX2 →
   Draco → Export), so that I can see how a real pipeline is composed without building one from scratch.
2. As a NAE user, I want a real sample model (BoomBox) already loaded into the Import node, so that the
   example produces a visible result immediately.
3. As a NAE user, I want the editor to build the graph automatically when it opens, so that I see the
   exported result without clicking anything.
4. As a NAE user, I want the preview to show the actual exported `.glb` re-imported into Babylon via the
   Babylon Viewer, so that I'm looking at the true pipeline output, not an approximation.
5. As a NAE user, I want the graph to rebuild automatically whenever I change it (add / remove / reorder
   a node, rewire, edit a property, or re-import), so that the preview always reflects my current graph.
6. As a NAE user, I want rapid successive edits to collapse into a single rebuild, so that the editor
   doesn't thrash while I'm working.
7. As a NAE user, I want only the most recent rebuild's result to win, so that a slow earlier build
   can't overwrite a newer preview with stale output.
8. As a NAE user, I want a spinner over the preview while a rebuild is running, so that I know the
   editor is working and the preview may be about to change.
9. As a NAE user, I want a clear, non-fatal error in the preview area if a build fails, so that a bad
   graph doesn't crash the editor or silently leave a stale preview.
10. As a NAE user, I want the preview docked bottom-right (under the properties pane), so that it sits
    where I expect and doesn't crowd the palette.
11. As a NAE user, I want to select the Export node and click Export in its properties to download the
    processed file, so that I can save exactly what I'm previewing.
12. As a NAE user, I want the downloaded file to be byte-identical to what the preview shows, so that
    there's no ambiguity about what I exported.
13. As a NAE user, I want the redundant manual build/run toolbar button removed, so that the toolbar
    isn't cluttered with an action auto-build already covers.
14. As a NAE user, I want to remove either compression node and still have the pipeline build and
    preview, so that I can compare output with and without a compression step.
15. As a NAE user, I want to add a compression node into the pipeline, so that I can introduce
    compression to a pipeline that lacks it.
16. As a NAE user, I want to reorder the Draco and KTX2 nodes, so that I can arrange the pipeline however
    I like and still get correct output regardless of order.
17. As a NAE user, I want to select the Draco node and adjust its settings (method, encode speed, decode
    speed, quantization bits) in the properties pane, so that I can tune geometry compression the way I
    can already tune KTX2.
18. As a NAE user, I want in-browser Draco import and export to actually work, so that the default
    pipeline (which contains a Draco node) builds and previews without errors.
19. As a NAE user, I want both the KTX2 and Draco nodes to be first-class and tweakable, so that neither
    compression step feels like a black box.
20. As a Babylon developer, I want the runtime Import/Export blocks to accept injected WASM locations
    for Draco, so that the same blocks work both headless and in a same-origin-served browser context.
21. As a maintainer, I want the editor's user-facing pipeline behavior (open → preview → export →
    reorder) covered by end-to-end tests, so that regressions in those flows are caught.
22. As a maintainer, I want the auto-build timing logic covered by fast, deterministic unit tests, so
    that debounce and supersede behavior is verified without a flaky browser test.
23. As a maintainer, I want the backend roundtrip and compression behavior to remain covered by headless
    unit tests, so that the pipeline's core contract is protected independent of the editor.
24. As a maintainer, I want completed issues marked resolved under one consistent status vocabulary, so
    that the tracker accurately reflects what is done.

## Implementation Decisions

- **Premade default graph + default asset.** The editor's graph controller seeds a premade, **wired**
  pipeline — Import → KTX2 → Draco → Export — replacing today's unconnected Import + Export pair. On
  open it fetches a default **BoomBox `.glb`** from the CDN (the Playground `scenes/` path; Playwright
  uses the `:1337` test CDN, which serves the same path) and loads those bytes into the Import block, so
  the example has real content. Order is Import → KTX2 → Draco → Export per the definition of done.
- **Preview via Babylon Viewer V2 (programmatic).** Replace the hand-rolled Engine / Scene /
  append-scene preview with the **Viewer V2 programmatic API**: create a viewer bound to the editor's
  own preview canvas and load the freshly-exported bytes into it (the Viewer accepts an in-memory binary
  view). Keep our own preview pane and canvas; do **not** adopt the viewer web-component chrome. Lean on
  the Viewer's built-in load abort / supersede.
- **Auto-build (debounce + latest-wins) via a pure scheduler.** Introduce a small **pure scheduler**
  module that listens to the editor state's change signal plus the initial open, **debounces** triggers
  (~400 ms; build immediately on open), and enforces **latest-wins** so a stale build's result is
  discarded once a newer build has started. It drives the controller's existing `buildAsync` and the
  Viewer load. A **translucent spinner overlay** covers the preview surface for the entire build + load
  span. On failure, a **minimal in-pane error state** is shown (no crash, no silent stale preview).
- **Preview placement + toolbar/export rationalization.** Move the preview pane to the **right/bottom**
  slot (beneath Properties); vacate the left/bottom slot. **Remove** the redundant manual build/run
  toolbar button (auto-build replaces it). The **Export node's** properties-pane Export button downloads
  the **cached bytes from the last successful build** (identical to what the preview loaded); there is
  no separate toolbar export.
- **Fix in-editor Draco WASM (issue 05) by serving it same-origin.** Import the Draco **encoder** and
  **decoder** WASM as URLs from the root `node_modules` (mirroring how the block catalog already serves
  the KTX2 / Basis WASM) and inject those URLs into the Import and Export blocks, which pass them to the
  Draco module loader (`locateFile` / `wasmBinary`). Loading stays **unconditional**. This fixes the
  in-browser crash **and** lets the default Draco pipeline encode and preview in-browser. The runtime
  Import/Export blocks gain an **injectable WASM-location input** so headless and browser contexts both
  work; conditional "load only when Draco is present" is deferred as polish.
- **Draco property section (UI only).** The editor's property-section builder gains a **Draco section**
  exposing the block's existing `method` / `encodeSpeed` / `decodeSpeed` / `quantizationBits` fields,
  alongside the existing Import / Export / KTX2 sections. No runtime behavior change.
- **Draco add/remove/reorder is already correct (no runtime change).** Draco tags the document at write
  time; KTX2 mutates textures in place; the two are orthogonal, so any ordering of the linear,
  pull-evaluated build yields correct output. No change to the build algorithm.

## Testing Decisions

Good tests assert **external, user-observable behavior** — rendered DOM, downloaded bytes, scheduler
outputs — never internal wiring. Three seams, preferring the highest and reusing existing ones:

- **Playwright editor e2e (existing, primary/highest seam).** Reshape the current editor Playwright
  tests into three flows: (1) **opens to the premade wired graph** with BoomBox and **auto-previews
  without error** — the spinner appears then clears, the preview canvas is present, and no console error
  occurs; (2) **export matches preview** — selecting the Export node and clicking Export fires a
  `download` event yielding a valid `.glb`; (3) **reorder/remove rebuilds** — removing or reordering a
  compression node triggers a successful rebuild. Assertions are on **DOM state + download events**; no
  gating pixel comparison. Prior art: the existing `nodeAssetsEditor.test.ts` (file-chooser import,
  port-drag wiring, `download` event assertions, preview-canvas visibility).
- **node-assets vitest unit (existing, backend regression seam).** Keep the roundtrip / Draco / KTX2
  coverage, and **extend** it so the issue-05 change is covered at the **block contract** level — the
  Import/Export blocks accept an injected Draco decoder/encoder WASM location — with no browser. Prior
  art: the existing `dracoCompressionBlock` / `ktx2CompressionBlock` / `nodeAsset` unit tests.
- **buildScheduler vitest unit (one new seam).** The auto-build timing logic is extracted into a pure
  module and tested with **fake timers** in the node environment: rapid triggers collapse into a single
  build, open builds immediately, and a stale in-flight build's result is discarded when a newer build
  starts. This lives in a new `test/unit/` under the editor package and is picked up by the existing
  vitest `unit` project glob (`packages/**/test/unit/**`). Chosen over verifying timing through the
  browser, which is flaky and can't easily assert "stale result discarded."

## Out of Scope

- **Conditional Draco loading** ("load the WASM only when a Draco node is present") — deferred polish;
  unconditional load is the minimal complete fix.
- **Previewing an intermediate node's output** and **per-node memoization** — still deferred.
- **Branching / multi-input / fan-out** and clone-on-mutate — the graph stays linear.
- **Promoting the node-graph framework** to other Babylon node tools (NME, NGE, NRGE, NPE).
- **Other formats** (USD, images) and explicit conversion blocks.
- **Milestone 2 scoping** and **`/improve-codebase-architecture`** — parked; they do **not** block M1
  done and belong to a later effort.

## Further Notes

- **Cleanup pass (housekeeping, done by the orchestrators inline).** Verify issues 00 / 01 / 02 / 03 /
  06 actually landed (code exists and acceptance criteria are met), then set `Status: resolved`. Issue
  05 is resolved by this completion effort. Adopt **`resolved`** as the canonical done-state for
  implementation issues (the tracker's wayfinding flow already uses the word), document it as a row in
  `docs/agents/triage-labels.md`, and normalize issue 06's ad-hoc `landed` → `resolved`.
- The default pipeline order (Import → KTX2 → Draco → Export) is the user's stated definition of done;
  the reorder/remove stories above are about proving the user can change it freely, not about changing
  the default.
