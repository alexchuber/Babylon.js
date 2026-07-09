# 02 — ImportUSDBlock: transcode USD onto the SCENE spine (tinyusdz-web)

Status: ready-for-agent

## Parent

`.scratch/02-scene-spine-and-usd/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md`
(**ImportUSDBlock**, **transcoder**) · Decision:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (the spine is the gltf-transform `Document`;
import transcoders are lossy funnels).

## Goal

Add the first **non-glTF entry point**: an `ImportUSDBlock` (a source block — no inputs, one **SCENE**
output) that parses USD (`.usd` / `.usda` / `.usdz`) via a WebAssembly build of **tinyusdz** and
transcodes the parsed stage onto a fresh gltf-transform `Document` (the SCENE spine). After it, the
palette has a **Sources** category with more than one entry, and every existing middle/export block
works on USD-sourced content unchanged.

## Spike framing (read first)

tinyusdz publishes an experimental web/WASM target (`lighttransport/tinyusdz`, `release/web`). Treat the
exact build + asset-loading integration as a **spike**. If the web build proves impractical within the
timebox, **fall back to a smaller USD-subset parser** — but keep the block's **SCENE-output contract
identical either way**, so the rest of the graph is unaffected. The deliverable is "USD in → SCENE out,"
not "all of tinyusdz."

## KISS ground rules (read first)

- Model on the existing boundary block `importGLTFBlock.ts`: extend `NodeAssetBlock`, register a single
  `SCENE` output in the constructor, do the work in `_buildBlockAsync`, and **dynamic-`import`** the USD
  parser inside the body so it stays out of the base bundle.
- Deliver the WASM/JS **by URL**, mirroring the Draco/KTX2 pattern: an injectable wasm-location property
  the block reads, defaulting to `node_modules` resolution for headless and a served same-origin URL in
  the editor (`ConfigureBlockForEditor`). Do **not** bundle the wasm into core.
- **No USD abstraction layer.** One transcoder function inside the block. Repetition over a premature
  abstraction (ADR 0002 style).

## What to build

- **`ImportUSDBlock`** — no inputs, one `SCENE` output; a `data` (bytes) property for the source USD
  (mirroring `ImportGLTFBlock.data`), plus the injectable USD-wasm location(s). Sketch:

  ```ts
  // src/Blocks/importUSDBlock.ts
  export class ImportUSDBlock extends NodeAssetBlock {
      public static override ClassName = "ImportUSDBlock";
      public data: Nullable<Uint8Array> = null;      // source .usd/.usda/.usdz bytes
      public usdWasmUrl: string | undefined = undefined; // injected in the editor, node_modules headless
      public readonly output: NodeAssetConnectionPoint; // SCENE

      public constructor(name: string, nodeAsset: NodeAsset) {
          super(name, nodeAsset);
          this.output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);
      }

      public override async _buildBlockAsync(): Promise<void> {
          // dynamic-import tinyusdz-web (or the subset fallback), parse `this.data`,
          // transcode the stage onto a new gltf-transform Document, set this.output.value.
      }
  }
  ```

- **Transcoder scope** (ADR 0001, lossy funnel) — map **geometry** (meshes/primitives), **materials**
  (`UsdPreviewSurface` → glTF PBR metallic-roughness where it maps cleanly), and the **node/transform
  hierarchy**. Flatten or drop USD concepts glTF cannot express (layers/composition arcs, variants,
  relationships, non-preview shaders); stash anything worth carrying verbatim under `extras`. **Document
  the loss profile** in the block's doc comment and/or a node note (user story 4) so users are not
  surprised.
- **Editor exposure** — a **Sources** palette category entry; inject the served wasm URL via
  `ConfigureBlockForEditor`. Self-register the descriptor if issue 01 has landed; otherwise add it to the
  existing catalog by hand (do **not** block on 01).
- Export the block from `src/index.ts`.

## Dependencies

- Add the tinyusdz web/WASM package (or a vendored `release/web` build) to
  `packages/dev/node-assets/package.json`. **Vet provenance + license** before adding (tinyusdz is
  Apache-2.0 — confirm the web build's license and third-party notices). Keep the import **dynamic** and
  **inside** the block body.
- If the subset-parser fallback is taken instead, document exactly which USD subset is supported and keep
  the same `SCENE` output.

## Tests

Headless `buildAsync()` is the primary seam:

- **USD import test** — a tiny fixture (`.usda` text or a small `.usdz`) → ImportUSD → ExportGLTF; assert
  the output `Document` has the expected mesh / material / node counts (prior art: the milestone-1
  glTF-roundtrip test). If a binary `.usdz` fixture is impractical headless, use a `.usda` text fixture
  or build the smallest stage in code.
- **Loss-profile assertion** — a variant/layer present in the fixture is flattened/dropped **as
  documented** (verify it is not silently mis-imported).
- **Editor Playwright** only if the Sources palette interaction needs coverage; prefer headless. If the
  spike lands the browser wasm path, a smoke test that a `.usd` imports and previews is valuable but
  secondary.

## Acceptance criteria

- [ ] `ImportUSDBlock` exists in `src/Blocks/`, extends `NodeAssetBlock`, has no inputs and one `SCENE`
      output, modeled on `ImportGLTFBlock`.
- [ ] It transcodes USD (`.usd` / `.usda` / `.usdz`) onto a fresh gltf-transform `Document` via
      tinyusdz-web (or the documented subset fallback), with USD wasm/JS delivered by **injectable URL**
      like Draco/KTX2.
- [ ] Geometry, `UsdPreviewSurface` → PBR materials, and node/transform hierarchy map onto the SCENE;
      unmappable USD concepts are flattened/dropped/`extras`-stashed, and the **loss profile is
      documented**.
- [ ] The block is exported from `src/index.ts` and appears under a **Sources** palette category
      (self-registered if issue 01 has landed).
- [ ] A headless `buildAsync()` test imports a USD fixture and asserts expected mesh/material/node counts
      plus the documented loss behavior; it passes.
- [ ] The `SCENE`-output contract is **identical** whether the tinyusdz-web path or the subset fallback
      is used.
- [ ] `lint:check` + `format:check` pass; the new dependency is vetted for license/provenance.

## Blocked by

- **Issue 00 (SCENE rename)** — the output is a `SCENE` wire. (Prefer sequencing after 00; if 00 has not
  landed, the block can temporarily output the old value and switch when the rename lands.)
- **Benefits from** issue 01 (self-registration) for palette exposure — **not** a hard block: append to
  the existing catalog if 01 has not landed.
