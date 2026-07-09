# 10 — Gate auto-build on build-relevant changes (stop cosmetic rebuilds)

Status: resolved

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (Milestone 1 hardening;
stems from the NAE build-performance diagnosis) · Glossaries:
`packages/tools/nodeAssetsEditor/CONTEXT.md` (editor terms) · `packages/dev/node-assets/CONTEXT.md`
(runtime terms) · `CONTEXT-MAP.md`.

## Why this is its own slice

The auto-build scheduler (issue 08) is currently wired to the editor's **generic visual change signal**,
so it cannot tell a build-affecting edit from a purely cosmetic one. Every node drag, frame move,
collapse, frame grouping, and node-title rename fires a full rebuild — and on the default BoomBox graph a
rebuild is a ~30s KTX2 compression. This slice inserts a semantic gate between "the graph looks different"
and "the graph builds differently." It is small, self-contained, and unit-testable in isolation, and it
does not depend on the worker slice (issue 11).

## What to build

**Introduce a "build-relevant change" signal.** Today `BuildScheduler` subscribes to the editor state's
raw visual change observable (`state.onChanged`), which also fires for cosmetic editor metadata. Add a
distinct signal that fires **only** when something that affects build output changes, and subscribe the
scheduler to that instead.

**Derive it from a cosmetic-free source.** `NodeAsset.serialize()` is already a complete, cosmetic-free
build identity: it captures topology + block properties + the imported source bytes, and it excludes
editor-only metadata (node position, node title, collapsed state, frames — those live in the editor's
block metadata, not the runtime graph). The controller should derive a **build-relevant signature** from
that serialized form after each reconcile and emit a change only when the signature differs from the
previous one. This also naturally dedupes undo/redo/reset that lands back on an identical graph.

**Classify the change sites.** After this change:

- **Build-relevant (must trigger exactly one rebuild):** add / remove a block, add / remove a wire,
  reorder the KTX2 / Draco blocks, edit a build-affecting property (re-import bytes, KTX2
  `generateMipmaps`, Draco `method` / `encodeSpeed` / `decodeSpeed` / `quantizationBits`), and a
  load / undo / redo that lands on a **genuinely different** graph.
- **Cosmetic (must NOT trigger a rebuild):** drag a node, move / collapse / group a frame, collapse a
  node, group nodes into a frame, rename a node's title, and end-of-interaction bookkeeping.

## Acceptance criteria

- [ ] Dragging a node, moving/collapsing/expanding a frame, collapsing/expanding a node, grouping nodes
      into a frame, and renaming a node's title produce **no rebuild** (no spinner, no build run).
- [ ] Adding/removing a block, adding/removing a wire, and reordering the KTX2/Draco blocks each trigger
      **exactly one** rebuild.
- [ ] Editing a build-affecting property (re-import bytes, KTX2 `generateMipmaps`, Draco
      `method` / `encodeSpeed` / `decodeSpeed` / `quantizationBits`) triggers **exactly one** rebuild.
- [ ] An undo/redo or graph load that lands on a graph identical to the current one triggers **no**
      rebuild; one that lands on a different graph triggers exactly one.
- [ ] The build-relevant signal is derived from a cosmetic-free source (e.g. `NodeAsset.serialize()`), not
      from the raw visual change observable.
- [ ] A unit test proves cosmetic edits produce no build-relevant signal while structural / property /
      reorder edits do.
- [ ] `lint:check` + `format:check` pass; headless unit tests are green; the NAE Playwright suite is
      green.

## Blocked by

None — can start immediately. Independent of issue 11. Both slices touch the build-trigger / build-invocation
area of the editor service and controller, so coordinate lightly on merge (no hard dependency either way).
