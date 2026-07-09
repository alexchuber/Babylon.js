# 00 — Rename the wire type from GLTF to SCENE

Status: ready-for-agent

## Parent

`.scratch/02-scene-spine-and-usd/PRD.md` · Glossaries: `packages/dev/node-assets/CONTEXT.md` +
`packages/tools/nodeAssetsEditor/CONTEXT.md` (both already say **SCENE**) · Decisions:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md`,
`docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md`

## Goal

Rename the sole `NodeAssetConnectionPointType.GLTF` value to **SCENE**. The payload is unchanged (a
gltf-transform `Document`); this is a naming/semantics change so the graph reads as a general asset
pipeline, not a glTF-only tool. `SCENE` is the single normalized spine every format funnels through
(ADR 0001); the wire still carries "a kind plus an opaque value" and the kinds stay a flat enum
(ADR 0002).

## Why this is its own slice

It is a pure rename with a small, well-defined blast radius (the enum, four blocks, one editor color
constant). Doing it **first** means every subsequent slice — USD import, the operator library — speaks
in terms of the SCENE spine rather than "GLTF." Foundational and low-risk, so it unblocks everything
without carrying any behavioral change of its own.

## KISS ground rules (read first)

- It is a **rename, not a refactor**. Do **not** add new kinds, touch the payload, or introduce a
  format/capability abstraction — ADR 0002 explicitly cut that.
- The CONTEXT glossaries **already use SCENE** (they were updated ahead of the code). Align the code to
  the glossary; **do not edit the glossaries**.
- Keep the block class names `ImportGLTFBlock` / `ExportGLTFBlock` **as-is** — those name the glTF
  *format* boundary, which is still correct. Only the wire *type* becomes SCENE (glTF import/export are
  still glTF; the spine they read/write is SCENE).

## What to change

- **`NodeAssetConnectionPointType`** — rename the `GLTF` member to `SCENE` and update its doc comment to
  describe the SCENE spine (the normalized gltf-transform `Document`), matching the glossary.
- **The four blocks** that register `NodeAssetConnectionPointType.GLTF` inputs/outputs —
  `importGLTFBlock`, `exportGLTFBlock`, `dracoCompressionBlock`, `ktx2CompressionBlock` — switch each to
  `.SCENE`. These are the only runtime references.
- **Editor** — the one reference is `GltfPortColor` in `blockCatalog.ts` (the port color for
  SCENE-typed ports, consumed in `nodeAssetGraphController.ts`). Rename it to `ScenePortColor` for
  consistency; the color value is unchanged.
- **Comments** — update prose that calls the wire "GLTF" to "SCENE" where it describes the wire type
  (not the glTF format boundary).

## Migration note (verify, don't assume)

The connection-point type is set in each block's constructor (`_registerInput`/`_registerOutput`), and
`NodeAsset.Parse` reconstructs blocks by class name — the enum value is **not** persisted in the save
format. Confirm this holds; if it does, no save-format migration is needed. If any serialized data does
reference the type by name, keep the rename backward-compatible on load.

## Tests

No new behavioral test is warranted for a pure rename — the value is that the **existing** suite stays
green end-to-end:

- The existing headless `buildAsync()` glTF-roundtrip test and the Draco / KTX2 tests must pass
  unchanged (they exercise the wires through every layer and are the regression net for the rename).
- `npm run lint:check` + `npm run format:check` pass — the rename must be complete, with **no** dangling
  `NodeAssetConnectionPointType.GLTF` references anywhere.

## Acceptance criteria

- [ ] `NodeAssetConnectionPointType.GLTF` is renamed to `SCENE`; its doc comment describes the SCENE
      spine (a gltf-transform `Document`).
- [ ] All runtime references are updated (the four blocks); no `NodeAssetConnectionPointType.GLTF`
      remains in the codebase.
- [ ] Editor `GltfPortColor` is renamed to `ScenePortColor` (value unchanged) and its usage updated.
- [ ] Block class names `ImportGLTFBlock` / `ExportGLTFBlock` are unchanged — only the wire type is
      renamed.
- [ ] The CONTEXT glossaries are **not** modified (they already say SCENE).
- [ ] The existing headless roundtrip + Draco + KTX2 tests pass unchanged; `lint:check` +
      `format:check` pass.

## Blocked by

None — can start immediately. **Unblocks** issue 02 (USD import) and issue 03 (operators), which are
both SCENE→SCENE / SCENE-out.

## Note for whoever merges

Touches the same four block files as issue 01 (self-registration). No logic overlap — expect trivial
conflicts if both run as separate branches. Landing this rename first (when convenient) means issue 01
registers `SCENE`-typed blocks with no follow-up churn.
