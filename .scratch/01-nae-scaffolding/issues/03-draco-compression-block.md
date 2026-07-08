# 03 — Draco compression block

Status: ready-for-agent

## Parent

`.scratch/01-nae-scaffolding/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md` · Builds on the backend from
`.scratch/01-nae-scaffolding/issues/01-gltf-roundtrip-backend.md` (landed).

## Goal

Add the first real "middle" block: a `DracoCompressionBlock` that sits between import and export and
Draco-compresses the mesh geometry, so a graph is `ImportGLTFBlock → DracoCompressionBlock →
ExportGLTFBlock` and the exported `.glb` is Draco-compressed. gltf-transform + the `draco3d` encoder do
the work. No registry, no abstraction — same shallow style as the existing blocks.

## KISS ground rules (read first)

- Model the new block **exactly** on the existing `src/Blocks/importGLTFBlock.ts` /
  `exportGLTFBlock.ts`: extend `NodeAssetBlock`, register a GLTF input and a GLTF output in the
  constructor, do the work in `_buildBlockAsync`, dynamic-`import` gltf-transform inside the body.
- The payload is a gltf-transform `Document`, used directly. GLTF in → GLTF out
  (`NodeAssetConnectionPointType.GLTF`, which already exists — no new type).
- Repetition is fine; abstraction is not. Do **not** invent a "transform block" base class or a
  compression-options abstraction for one block.

## The unavoidable coupling: Draco encodes at write time

This is the one non-obvious fact. In gltf-transform, `KHR_draco_mesh_compression` is applied by
configuring the extension on the `Document`, but the **actual encode happens when the document is
written** (`io.writeBinary`). For the write to succeed, the writing `WebIO` must have the Draco encoder
registered as a dependency. Likewise, reading a Draco-compressed glb needs the Draco decoder.

The current blocks build a bare `new WebIO().registerExtensions(ALL_EXTENSIONS)` with **no** encoder/
decoder dependencies. So this ticket must make the IO Draco-capable on both ends:

- **`ExportGLTFBlock`** — register the Draco **encoder** dependency on its `WebIO` so `writeBinary`
  actually compresses:
  ```ts
  const draco3d = await import("draco3d");
  const io = new WebIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "draco3d.encoder": await draco3d.createEncoderModule() });
  ```
- **`ImportGLTFBlock`** — register the Draco **decoder** dependency the same way
  (`"draco3d.decoder": await draco3d.createDecoderModule()`) so the pipeline (and the test) can read a
  Draco glb back. Keep the dynamic import so it stays out of the base bundle.

This is a small, honest edit to the two boundary blocks — not a new abstraction. (If it feels cleaner
to centralize the `WebIO` construction in one tiny local helper the three blocks share, that's fine —
but a plain repeated function is fine too. Do **not** build a registry or a plugin layer.)

## The block

```ts
// src/Blocks/dracoCompressionBlock.ts
export class DracoCompressionBlock extends NodeAssetBlock {
    public static override ClassName = "DracoCompressionBlock";

    /** The glTF to compress. */
    public readonly input: NodeAssetConnectionPoint;   // GLTF
    /** The same glTF, configured for Draco compression on export. */
    public readonly output: NodeAssetConnectionPoint;  // GLTF

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF);
    }

    public override async _buildBlockAsync(): Promise<void> {
        const document = this.input.value as Nullable<Document>;
        if (!document) {
            throw new Error(`The "${this.name}" Draco block has no input document.`);
        }
        // Enable KHR_draco_mesh_compression on the document. The encode happens when
        // ExportGLTFBlock writes it. Use @gltf-transform/extensions' KHRDracoMeshCompression,
        // or @gltf-transform/functions' draco() transform if that dep is added.
        // ... configure extension on `document` ...
        this.output.value = document; // same document, now flagged for Draco
    }
}
```

Code-API usage the block enables:

```ts
const asset = new NodeAsset("draco");
const importer = new ImportGLTFBlock("import", asset);
importer.data = glbBytes;
const draco = new DracoCompressionBlock("draco", asset);
const exporter = new ExportGLTFBlock("export", asset);
importer.output.connectTo(draco.input);
draco.output.connectTo(exporter.input);
const compressedGlb = await asset.buildAsync(); // Draco-compressed .glb
```

## Dependencies

- Add **`draco3d`** (the encoder/decoder WASM modules — `createEncoderModule` /
  `createDecoderModule`). Not currently in the repo; you are adding it to
  `packages/dev/node-assets/package.json`.
- `KHRDracoMeshCompression` already ships in `@gltf-transform/extensions` (a current dep). You may
  optionally add **`@gltf-transform/functions`** if you use its `draco()` helper to set encoder
  options; configuring the extension directly is also fine and avoids the extra dep. Prefer the
  smaller-surface option.
- All gltf-transform / draco3d imports stay **dynamic**, inside block bodies.

## Export the new block

Add `DracoCompressionBlock` to `src/index.ts` alongside the existing blocks.

## Tests (headless vitest, model on `test/unit/nodeAsset.test.ts`)

Follow `.github/instructions/tests.instructions.md`; assert external behavior:

- Building `Import → Draco → Export` over a fixture produces glb bytes that **declare
  `KHR_draco_mesh_compression`** and **re-import** (through `ImportGLTFBlock`, now decoder-capable) to
  equivalent geometry (same mesh / primitive / vertex counts) as the uncompressed roundtrip.
- For a non-trivial mesh fixture, the Draco output is **smaller** than the plain roundtrip output. (A
  trivial cube may not shrink — use a fixture with enough geometry, or assert this only on such a
  fixture.)
- `Import → Export` (no Draco) still works unchanged — the encoder/decoder registration must not break
  the plain roundtrip.

If bundling a binary fixture headless is impractical, build a Document with enough geometry in code,
run it through the graph, and assert the same three properties.

## Acceptance criteria

- [ ] `DracoCompressionBlock` exists in `src/Blocks/`, extends `NodeAssetBlock`, GLTF in → GLTF out,
      modeled on the existing Import/Export blocks.
- [ ] `ExportGLTFBlock` registers the `draco3d.encoder` dependency so writes actually Draco-encode;
      `ImportGLTFBlock` registers the `draco3d.decoder` dependency so Draco glbs read back. Both via
      dynamic import.
- [ ] `draco3d` is added as a dependency; any gltf-transform/draco imports remain dynamic and inside
      block bodies. No registry / capability / transform-base abstraction is introduced.
- [ ] `Import → Draco → Export` via the code API produces a Draco-compressed `.glb` (declares
      `KHR_draco_mesh_compression`) that re-imports to equivalent geometry.
- [ ] The plain `Import → Export` roundtrip still passes unchanged.
- [ ] `DracoCompressionBlock` is exported from `src/index.ts`.
- [ ] Headless vitest covers the Draco roundtrip (extension declared + geometry equivalent + smaller
      for a non-trivial mesh) and the unchanged plain roundtrip, and passes.
- [ ] `npm run lint:check` and `npm run format:check` pass.

## Editor exposure (blocked by issue 02 — do not block this ticket on it)

Making `DracoCompressionBlock` draggable in the Node Assets Editor depends on issue 02 establishing how
real blocks reach the palette. Once 02 lands, adding this block to the palette should be a trivial
registration. Leave a one-line note / TODO where 02's palette wiring will live; do **not** wait on 02
to ship the backend block above.

## Blocked by

None for the backend block + tests (01 has landed). Editor palette exposure is gated on 02, as above.

## Note for whoever merges

Shares two files with issue 04 (KTX2) — `src/index.ts` and `package.json` — so expect trivial merge
conflicts if 03 and 04 run as separate branches. No logic overlap.
