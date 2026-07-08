# 02 — Wire the Fluent editor to the NodeAssets backend (real glTF roundtrip + preview)

Status: ready-for-agent (blocked)

## Parent

`.scratch/node-assets/PRD.md` · Glossary: `.scratch/node-assets/CONTEXT.md`

## Goal

Make the editor actually do something: replace issue 00's dummy data with the real NodeAssets backend
from issue 01, so a user can import a glTF, see it, and export it back out — a real roundtrip in the
browser.

## What to build

- **Swap dummy data for the real graph.** Replace the demo app's `DummyNode` / `DummyPort` /
  `DummyWire` model with real `NodeAsset` / `NodeAssetBlock` / `NodeAssetConnectionPoint` from
  `@babylonjs/node-assets`. The reusable canvas framework from issue 00 stays generic — it renders
  whatever visual model it is handed. This issue provides an **adapter** from the live `NodeAsset`
  graph to that visual model; the adapter (not the framework) is where NodeAssets-specific and
  gltf-transform types live.
- **Palette** offers the two real blocks (Import glTF, Export glTF). Dragging one onto the canvas
  constructs the real block and attaches it to the `NodeAsset`.
- **Import block UI** — a file picker that loads a `.glb` / `.gltf` into the `ImportGLTFBlock`'s
  `data`.
- **Export action** (export-block button or toolbar) — calls `NodeAsset.buildAsync()` and downloads
  the resulting bytes.
- **Live preview** — host a Babylon engine + scene + glTF loader in the right-pane preview placeholder
  from issue 00; after a build, load the exported bytes back through Babylon's glTF loader so the
  preview shows the *real* output. First cut can build on demand or on change; debounce / supersede /
  state indicators are deferred polish (see PRD).
- **Save / load** — serialize the `NodeAsset` graph (blocks + properties + connections + editor
  positions) to JSON and back, wired to the toolbar. Add a minimal `serialize()` / `Parse()` to the
  backend if issue 01 did not.

## Acceptance criteria

- [ ] The palette offers Import glTF and Export glTF; dropping them creates real backend blocks
      attached to the `NodeAsset`.
- [ ] Connecting the two blocks' ports connects the real connection points.
- [ ] Importing a `.glb` and hitting Export downloads a roundtripped `.glb` produced by
      `NodeAsset.buildAsync()`.
- [ ] The preview pane shows the exported asset loaded through Babylon's glTF loader.
- [ ] Save writes the graph to JSON; Load restores it (blocks, connections, positions).
- [ ] The issue-00 canvas framework stays free of NodeAssets-specific and gltf-transform types (the
      adapter lives in the app).
- [ ] A Playwright test drives import → export → preview and screenshots the result (per
      `.github/instructions/editor-interaction.instructions.md`).

## Blocked by

- Issue 00 (editor skeleton / canvas framework)
- Issue 01 (NodeAssets backend)
