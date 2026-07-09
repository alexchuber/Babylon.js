# 00 — IMAGE payload lane: kind + Import/Export blocks + generalized `buildAsync()` terminal

Status: ready-for-agent

## Parent

`.scratch/04-image-pipeline/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**ImportImageBlock / ExportImageBlock**, **connection point type** → `IMAGE`, **NodeAsset**:
"`buildAsync()` pull-evaluates it from the terminal export block") · Decisions:
`docs/adr/0002-wire-payload-is-kind-plus-opaque-value.md` (a wire is a kind plus an opaque `value`;
"adding a new payload kind is a one-line enum addition plus blocks that read/write that `value`
shape" — `IMAGE` is already listed) · `docs/adr/0001-scene-spine-is-gltf-transform-document.md`
(SCENE is one lane; IMAGE is a parallel lane, not funnelled through the spine).

## Goal

Open the **second payload lane**. Add an **IMAGE** connection point kind and its two boundary blocks —
an **ImportImageBlock** (a source block: no inputs, one `IMAGE` output) and an **ExportImageBlock**
(a sink block: one `IMAGE` input, a terminal export block parallel to `ExportGLTFBlock`) — then
**generalize `buildAsync()`** to pull from whatever terminal export block it finds (SCENE **or** IMAGE)
instead of hard-coding `ExportGLTFBlock`. After it, `ImportImage → ExportImage` builds end-to-end
headlessly, and every existing all-SCENE graph still builds unchanged.

## Why this is its own slice

It is the thin **end-to-end vertical slice** that makes the image lane exist: the IMAGE kind, both
boundary blocks, and the terminal generalization that lets a pure-image graph build. It is deliberately
**pure bytes-at-boundary** — no canvas, no pixel decode — so the whole thing is headless-testable and
low-risk. Every operation issue (01, 02) and the preview issue (03) build on it, and slice 06
(extract/recompose) will bridge this lane to the SCENE spine. It is also the **minimal, contained
relaxation** of the milestone-1 single-sink assumption.

## KISS ground rules (read first)

- **IMAGE payload shape** is `{ data: Uint8Array; mimeType: string; width?: number; height?: number }`
  — **encoded bytes plus metadata**, per the PRD and ADR 0002. The wire's `value` slot just carries
  this object; kind-equality is checked at `connectTo`. **No wrapper class, no format/capability
  abstraction** (ADR 0002 explicitly cut that). Define the payload TS type once in a small shared module
  (e.g. `src/Blocks/imagePayload.ts`) so ops and export agree on the shape.
- **`IMAGE` is a one-line enum addition** on `NodeAssetConnectionPointType`. Do not reshape the enum.
- **ImportImage / ExportImage are pure boundary blocks — no canvas.** Import wraps the source bytes +
  `mimeType` (from the picker / file extension); `width`/`height` may stay `undefined` until an op
  decodes them. Export simply surfaces `payload.data` as its `result`. Model them on
  `importGLTFBlock.ts` / `exportGLTFBlock.ts` (including the base64 serialize/deserialize of the source
  bytes on import).
- **Generalized terminal is the minimal relaxation.** Find the **one** terminal export block via a
  shared "is export" marker (both export blocks expose the marker **and** a common `result: Uint8Array`),
  **not** `instanceof ExportGLTFBlock`. Multi-sink / per-branch graphs stay out of scope (PRD).
- **Do not build the operations or the image preview here** — those are issues 01/02 and 03.

## What to build

- **`NodeAssetConnectionPointType.IMAGE`** — add the member with a doc comment describing the IMAGE
  payload (encoded bytes + metadata), matching the glossary.
- **`ImportImageBlock`** — no inputs, one `IMAGE` output; a `data` (source bytes) property and a
  `mimeType` property, base64-serialized like `ImportGLTFBlock.data`. Sketch:

  ```ts
  // src/Blocks/importImageBlock.ts
  export class ImportImageBlock extends NodeAssetBlock {
      public static override ClassName = "ImportImageBlock";
      public data: Nullable<Uint8Array> = null;   // source PNG/JPEG/WebP bytes
      public mimeType = "image/png";               // from the picker / file extension
      public readonly output: NodeAssetConnectionPoint; // IMAGE

      public constructor(name: string, nodeAsset: NodeAsset) {
          super(name, nodeAsset);
          this.output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
      }

      public override async _buildBlockAsync(): Promise<void> {
          if (!this.data) { throw new Error(`The "${this.name}" import block has no data to import.`); }
          this.output.value = { data: this.data, mimeType: this.mimeType }; // width/height decoded later
      }
  }
  ```

- **`ExportImageBlock`** — one `IMAGE` input, a `result: Nullable<Uint8Array>`; on build, reads the
  IMAGE payload and sets `result = payload.data`. Carries the shared **terminal-export marker**.
- **Generalized `buildAsync()`** (in `nodeAsset.ts`) — locate the single terminal export block via the
  shared marker (not by concrete class), evaluate it, and return its `result`; keep a clear
  "no export block" error. Give `ExportGLTFBlock` the **same marker + `result` contract** so both are
  found the same way. Keep the single-sink assumption (zero export blocks → error; multiple → out of
  scope, first-or-error is fine).
- **Editor exposure** — an **Image** palette category (distinct header color from Sources/Operators),
  an `ImagePortColor` in `blockCatalog.ts` for `IMAGE`-typed ports, self-registered `import-image` /
  `export-image` descriptors under `blockDescriptors/`, and property lines via `buildPropertySections`
  (import: the source-image file/bytes picker; export: minimal). Model on the existing glTF descriptors.
- Export both blocks + the IMAGE payload type from `src/index.ts`; add the two descriptor modules to the
  `blockDescriptors/index.ts` barrel.

## Tests

Headless `buildAsync()` is the primary seam (this whole slice is canvas-free):

- **Image roundtrip** — `ImportImage(png bytes)` → `ExportImage` → `buildAsync()` returns the **same
  bytes**, and the `mimeType` is preserved. No canvas required.
- **Generalized-terminal** — a graph ending in `ExportImage` builds with **no glTF export present**;
  and an existing all-SCENE graph ending in `ExportGLTF` **still builds unchanged** (regression — this
  is the net for the terminal generalization).
- **Save/load** — an `ImportImage` / `ExportImage` graph round-trips through `serialize()` /
  `NodeAsset.Parse()` (source bytes as base64), blocks are reconstructed, and the reparsed graph still
  `buildAsync()`es. (Self-registration already covers the registry mechanism.)
- **Kind-equality** — `connectTo` **rejects** a mismatched `IMAGE ↔ SCENE` wire (nominal kind check,
  ADR 0002).

## Acceptance criteria

- [ ] `NodeAssetConnectionPointType.IMAGE` exists with a doc comment describing the encoded-bytes +
      metadata payload; the IMAGE payload TS type is defined once in a shared module and exported.
- [ ] `ImportImageBlock` (no inputs, one `IMAGE` output) wraps source bytes + `mimeType` into an IMAGE
      payload, modeled on `ImportGLTFBlock` (base64 serialize/deserialize of the source bytes).
- [ ] `ExportImageBlock` (one `IMAGE` input, terminal export) surfaces `payload.data` as `result`;
      it and `ExportGLTFBlock` share one "is export" marker + `result` contract.
- [ ] `buildAsync()` locates the terminal export block **generically** (via the marker, not
      `instanceof ExportGLTFBlock`) and returns its `result`, with a clear error when none exists; the
      single-sink assumption is retained.
- [ ] Both blocks self-register (runtime factory + editor descriptor), appear under an **Image** palette
      category with an `IMAGE` port color, and are exported from `src/index.ts`.
- [ ] Headless tests pass: image roundtrip (bytes + mimeType), generalized-terminal (ExportImage builds
      with no glTF; ExportGLTF unchanged), save/load, and `IMAGE↔SCENE` connect rejection.
- [ ] `lint:check` + `format:check` pass; no canvas/browser dependency is introduced by this slice.

## Blocked by

None — can start immediately. **Independent of slice 03.** **Unblocks** issues 01 and 02 (the image
operations) and issue 03 (image preview). Slice 06 (extract/recompose) will build on this IMAGE lane.

## Note for whoever merges

Touches `nodeAsset.ts` (`buildAsync`) and `ExportGLTFBlock` (adds the shared export marker/`result`
contract) alongside otherwise-additive new files. No logic overlap with the SCENE lane — expect only
trivial conflicts. Landing this first makes issues 01/02/03 pure additions on top of a stable IMAGE
boundary.
