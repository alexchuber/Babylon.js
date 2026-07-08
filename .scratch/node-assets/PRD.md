# PRD: NodeAssets (PoC)

Status: ready-for-agent

## What this is

NodeAssets is a small, node-based content pipeline for Babylon.js, plus a companion Fluent node editor
to author it. You build a graph of **blocks** that takes a source asset in and produces a
Babylon-ready asset out. It's a proof of concept inspired by the old "Polymorph" idea — a shared,
recombinant toolkit for the "messy middle" between creation assets (CAD, USD) and consumption assets
(glTF).

**This is a PoC. Keep it KISS.** The whole MVP is: **import a glTF and export it back out**, with
gltf-transform doing the read/write underneath, authored in a node editor. No registry, no
format-abstraction layer, no compression, no phases — all considered and cut as premature. Repetition
is fine; abstraction is earned later, if ever.

## Problem (the "messy middle")

Everyone preparing 3D content for the web hand-rolls the same one-off pipelines — decimate here,
compress textures there, convert formats somewhere else. They don't compose or reuse. NodeAssets is a
first, tiny step toward a shared, visual, composable way to assemble those steps and see the real
result.

## Solution (MVP)

A node graph with two surfaces that are the *same underlying object*:

1. A **code API** — construct a `NodeAsset`, add blocks, connect them, `buildAsync()` to get output
   bytes. Shaped like Babylon's other node systems (see Conventions).
2. A **visual node editor** (the "Node Assets Editor") — a fresh Fluent canvas to assemble the same
   graph by dragging blocks and connecting them, with a live 3D preview of the real exported asset.

The MVP graph is **ImportGLTFBlock → ExportGLTFBlock**: pick a `.glb`, roundtrip it through
gltf-transform, get a `.glb` back and see it in the preview.

## Conventions (the one hard rule)

The API's nomenclature and shape **mirror Babylon's existing node systems** — `NodeMaterial`,
`SmartFilters`, `FlowGraph` — so it feels native. Model the code on `packages/dev/smartFilters`:

- **`NodeAsset`** — the graph (mirrors `SmartFilter` / `NodeMaterial`). `buildAsync()` runs it.
- **`NodeAssetBlock`** — a node (mirrors `BaseBlock` / `NodeMaterialBlock`).
- **`NodeAssetConnectionPoint`** — a typed input/output (mirrors `ConnectionPoint` /
  `NodeMaterialConnectionPoint`), with `direction`, `type`, `connectTo`, `connectedPoint`.
- **`ImportGLTFBlock` / `ExportGLTFBlock`** — the boundary blocks.

The payload flowing along a glTF connection is a **gltf-transform `Document`, used directly** — no
wrapper, no "asset" / "capability" / "format" abstraction. gltf-transform lives only inside the glTF
block bodies. Singular class `NodeAsset` mirrors `NodeMaterial`; the product is "NodeAssets"; the
editor is the "Node Assets Editor". Full glossary: `CONTEXT.md`.

## Code API shape

```ts
const asset = new NodeAsset("roundtrip");
const importer = new ImportGLTFBlock("import", asset);
importer.data = glbBytes;                 // from a file picker in the editor
const exporter = new ExportGLTFBlock("export", asset);
importer.output.connectTo(exporter.input);
const glb = await asset.buildAsync();     // roundtripped .glb bytes
```

Each block owns its settings as plain properties (no registry). The editor and the code API construct
the exact same objects.

## The editor

A fresh Fluent editor (same component library / style as Inspector V2), built in two slices:

- **Issue 00** — the visual skeleton: three-panel node editor (palette · canvas · properties +
  preview) on the new Fluent shared components, driven by dummy data. Fully interactive,
  runtime-independent. (Already in progress.)
- **Issue 02** — wire that skeleton to the real backend: real Import/Export blocks, file picker in,
  `buildAsync()` + download out, and a live Babylon glTF-loader preview of the exported asset.

## Scope

**In (MVP):** the node system; `ImportGLTFBlock` + `ExportGLTFBlock`; `buildAsync()` roundtrip via
gltf-transform; the Fluent editor (00) wired to it (02) with import / export / preview; headless
roundtrip tests.

**Out:** anything beyond a clean glTF roundtrip — see Deferred.

## Deferred / future (explicitly NOT in the MVP)

Kept reachable but **not built now**. When we build these, revisit the API *then* — don't pre-abstract
for them today.

- **Compression blocks.** Draco (encodes at write-time in the browser via WASM — a Draco block just
  tags the document; the encode happens on write). KTX2 (gltf-transform **can't** encode KTX2 in the
  browser; reuse the existing Babylon browser Basis→KTX2 encoder prototype — ETC1S for color, UASTC
  for non-color; texture dims multiple of 4; SDR only; no cube maps).
- **More transforms / operations** (dedup, weld, prune, LODs, material edits, metadata) — thin
  wrappers over gltf-transform functions, one block each.
- **Branching / multi-input / fan-out** — when added, mutating blocks must clone their input first
  (gltf-transform mutates in place), and `buildAsync` gains real dependency ordering. The MVP graph is
  linear, so none of this exists yet.
- **Live-preview polish** — debounced rebuilds (~10s), superseding in-flight rebuilds,
  waiting/rebuilding/done/errored indicators, previewing any node's intermediate result, per-node
  memoization.
- **Save/load format** — a stable serialized graph schema (issue 02 gets a minimal version).
- **Other formats** (USD, images) + explicit conversion blocks — this is why connection points are
  typed even though there is only one type today.
- **Server-side / heavy operations** (Simplygon-class) behind the same block interface.

## Testing

Assert external behavior, not internals. The load-bearing test: a `NodeAsset` of ImportGLTFBlock →
ExportGLTFBlock produces glb bytes that re-parse into a valid glTF (a genuine gltf-transform read/write
roundtrip). Headless vitest, modeled on `packages/dev/lottiePlayer/test/unit`. Editor behavior
(import → export → preview) is covered by a Playwright test in issue 02.

## Issues

- **00 — Fluent node editor skeleton** (dummy data, runtime-independent). In progress.
- **01 — NodeAssets backend: glTF roundtrip** (the node system + Import/Export blocks + `buildAsync`).
  Not blocked; overnight-safe.
- **02 — Wire editor to backend** (real blocks, import / export / preview, save / load). Blocked by
  00 + 01.
