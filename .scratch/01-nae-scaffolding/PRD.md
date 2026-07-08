# PRD: NodeAssets — Milestone 1 (NAE scaffolding)

Status: shipped (milestone 1) · one known defect open (issue 05)

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

- **Issue 05 (open):** the Draco decoder WASM fails to load under the editor's Vite dev server, which
  breaks in-browser import for every graph. Headless/unit paths are unaffected. This is the one
  outstanding milestone-1 defect; the editor's import→export and KTX2 Playwright roundtrips are red
  until it's fixed.

## Deferred / future (explicitly NOT in milestone 1)

Kept reachable but not built. When we build these, revisit the API *then* — don't pre-abstract today.

- **More transforms / operations** (dedup, weld, prune, LODs, material edits, metadata) — thin
  wrappers over gltf-transform functions, one block each.
- **Branching / multi-input / fan-out** — when added, mutating blocks must clone their input first
  (gltf-transform mutates in place), and `buildAsync` gains real dependency ordering. Today's graph is
  linear, so none of this exists yet.
- **Live-preview polish** — debounced rebuilds, superseding in-flight rebuilds,
  waiting/rebuilding/done/errored indicators, previewing any node's intermediate result, per-node
  memoization.
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

- `issues/00-fluent-node-editor-skeleton.md` — the Fluent editor UI skeleton (dummy data).
- `issues/01-gltf-roundtrip-backend.md` — the runtime glTF import→export roundtrip.
- `issues/02-wire-editor-to-backend.md` — wire the editor to the runtime (import / export / preview /
  save / load).
- `issues/03-draco-compression-block.md` — the Draco compression block.
- Issue 04 (KTX2 compression block) — landed; ticket file removed after completion.
- `issues/05-draco-decoder-wasm-in-editor.md` — open defect (see Status / known gaps).
- `issues/06-milestone-1-cleanup.md` — this cleanup (rename slug, rewrite PRD as-built, split
  glossaries per package + root map).
