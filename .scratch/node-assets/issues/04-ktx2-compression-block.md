# 04 — KTX2 (Basis Universal) texture compression block

Status: ready-for-agent — **this one is a browser spike, not a clean headless task. Read the "Reality
check" before running it unsupervised.**

## Parent

`.scratch/node-assets/PRD.md` · Glossary: `.scratch/node-assets/CONTEXT.md` · Builds on the backend from
`.scratch/node-assets/issues/01-gltf-roundtrip-backend.md` (landed).

## Goal

Add a `KTX2CompressionBlock` that sits between import and export and compresses the model's **textures**
to KTX2 / Basis Universal, so a graph is `ImportGLTFBlock → KTX2CompressionBlock → ExportGLTFBlock` and
the exported `.glb` uses `KHR_texture_basisu` textures. Same shallow block style as the existing blocks.

## Reality check (why this is different from Draco — read first)

- **gltf-transform cannot encode KTX2 in the browser.** Its KTX2 path (`toktx`) shells out to the
  native KTX-Software CLI, which isn't available in a browser or in our test runners. So this block
  **cannot** lean on gltf-transform for the encode the way Draco does.
- **You must drive a real Basis encoder yourself.** There is a Basis Universal **encoder** already
  staged in the repo: `packages/tools/babylonServer/public/basis_encoder.js` (+ `.wasm`). It's the raw
  Basis `BASIS` WASM module (`var BASIS = (() => …)`) with **no TypeScript wrapper** — you write the
  glue (load the module, create a `BasisEncoder`, feed it raw image pixels, get KTX2 bytes out). Treat
  it as the prototype to reuse; confirm its exact JS API from the file itself.
- **The encode happens inside this block**, not at write time. Unlike Draco, `ExportGLTFBlock` needs
  **no change**: `KHR_texture_basisu` is already in `ALL_EXTENSIONS`, and gltf-transform treats KTX2
  image payloads as opaque bytes on write. This block replaces each texture's image bytes with KTX2 and
  flags the extension; export just writes them.
- **Testing is browser-based.** The encoder WASM and the image-decode step (source PNG/JPEG → raw RGBA)
  are browser-oriented. Expect a **Playwright** roundtrip test, not headless vitest. This makes 04 more
  like issue 02's world than issue 01's. If you find a workable headless path (Node loading the Basis
  wasm + a pure-JS image decoder), that's acceptable too — but the browser harness is the expected
  surface.

Net: 04 has real unknowns (the Basis encoder JS API, loading the wasm, the browser test harness). It is
worth starting, but it is a spike that may need supervision — not a guaranteed wake-up-to-it-done task.

## The block

```ts
// src/Blocks/ktx2CompressionBlock.ts
export class KTX2CompressionBlock extends NodeAssetBlock {
    public static override ClassName = "KTX2CompressionBlock";

    public readonly input: NodeAssetConnectionPoint;   // GLTF
    public readonly output: NodeAssetConnectionPoint;  // GLTF

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF);
    }

    public override async _buildBlockAsync(): Promise<void> {
        const document = this.input.value as Nullable<Document>;
        if (!document) {
            throw new Error(`The "${this.name}" KTX2 block has no input document.`);
        }
        // For each texture on the document:
        //   - decode its image bytes to raw RGBA + width/height
        //   - honor the constraints below (skip anything that violates them)
        //   - encode with Basis (ETC1S for color, UASTC for non-color)
        //   - replace the texture image with the KTX2 bytes, set mime type "image/ktx2"
        //   - enable KHR_texture_basisu on the document
        this.output.value = document;
    }
}
```

## Encode rules (from the design — honor all of them)

- **ETC1S** for color textures (base color, emissive — sRGB/color data).
- **UASTC** for non-color / data textures (normal, metallic-roughness, occlusion).
- **Texture dimensions must be a multiple of 4.** Skip (leave uncompressed) any texture that isn't, or
  document a resize decision — but do not silently corrupt it.
- **SDR only** — skip HDR textures (e.g. environment/IBL).
- **No cube maps** — skip cube textures.
- A texture that is skipped for any of these reasons must pass through unchanged (still a valid export).

Determining "color vs non-color" means inspecting how each texture is used by the document's materials
(base color / emissive slots are color; normal / MR / occlusion slots are data). gltf-transform's
material accessors give you this.

## Dependencies / assets

- Reuse `packages/tools/babylonServer/public/basis_encoder.js` + `.wasm`. Since a dev package can't
  import from a tools `public/` folder, **vendor** the two files into the node-assets package (e.g.
  `packages/dev/node-assets/src/vendor/` or the test harness) and load the wasm at runtime, or load
  them from the dev server in the Playwright harness. Pick the simplest thing that runs; keep the wasm
  out of the base bundle (dynamic load).
- No new npm dependency should be needed for the encoder (the wasm is vendored). You may add a small
  image-decode helper only if the browser's native decode (`createImageBitmap` + canvas) isn't
  sufficient.
- `KHRTextureBasisu` comes from `@gltf-transform/extensions` (already a dep).

## Export the new block

Add `KTX2CompressionBlock` to `src/index.ts` alongside the existing blocks.

## Tests (Playwright roundtrip; see `.github/instructions/editor-interaction.instructions.md` for the
harness pattern)

Assert external behavior:

- Building `Import → KTX2 → Export` over a fixture with a power-of-two (multiple-of-4) texture produces
  a glb that **declares `KHR_texture_basisu`** and whose textures carry `image/ktx2` payloads.
- The exported glb **loads in Babylon** (glTF loader + the existing KTX2 **decoder**) and renders — a
  genuine encode→export→decode roundtrip, screenshot it.
- A texture that violates a constraint (odd dimensions, HDR, cube map) passes through **uncompressed**
  and the export is still valid.

## Acceptance criteria

- [ ] `KTX2CompressionBlock` exists in `src/Blocks/`, extends `NodeAssetBlock`, GLTF in → GLTF out,
      modeled on the existing blocks.
- [ ] The block drives the vendored Basis encoder (`basis_encoder.wasm`) to produce KTX2 bytes;
      encoding happens inside the block (no `ExportGLTFBlock` change).
- [ ] ETC1S-for-color / UASTC-for-non-color selection is implemented; multiple-of-4, SDR-only, and
      no-cube-map constraints are honored, with violating textures passing through uncompressed.
- [ ] `Import → KTX2 → Export` produces a `.glb` that declares `KHR_texture_basisu` with `image/ktx2`
      textures and loads/renders in Babylon via the glTF loader + KTX2 decoder.
- [ ] The plain `Import → Export` roundtrip still passes unchanged.
- [ ] `KTX2CompressionBlock` is exported from `src/index.ts`.
- [ ] A Playwright test drives the encode→export→decode roundtrip and screenshots the rendered result.
- [ ] `npm run lint:check` and `npm run format:check` pass.

## Editor exposure (blocked by issue 02 — do not block this ticket on it)

As with Draco, palette exposure depends on issue 02's block-to-palette wiring. Ship the backend block +
roundtrip test; leave a one-line note where 02's palette registration will add it.

## Blocked by

None strictly (01 has landed), but practically needs a browser test harness. Independent of issue 02's
editor work, though it reuses the same browser/Playwright infrastructure conceptually.

## Note for whoever merges

Shares `src/index.ts` and `package.json` with issue 03 (Draco) — expect trivial merge conflicts if 03
and 04 run as separate branches. No logic overlap.
