# 01 — NodeAssets backend: glTF import → export roundtrip

Status: ready-for-agent

## Parent

`.scratch/01-nae-scaffolding/PRD.md` · Glossary: `packages/dev/node-assets/CONTEXT.md` (use these terms in code)

## Goal

Stand up the smallest real NodeAssets backend: a tiny node graph that imports a glTF and exports it
back out, with gltf-transform doing the read/write underneath. This is the "backend ready to plug in"
that the Fluent editor (issue 00 skeleton → issue 02 wiring) will drive. No compression, no transforms,
no registry, no abstraction layers — KISS.

## KISS ground rules (read first)

- Build the simplest, shallowest thing that roundtrips a glTF. **Repetition is fine; abstraction is
  not.**
- **Follow the conventions of Babylon's existing node systems.** Model the code on
  `packages/dev/smartFilters` (`SmartFilter` / `BaseBlock` / `ConnectionPoint`) and
  `NodeMaterial` — same shapes, same naming rhythm.
- **gltf-transform is used directly inside the glTF block bodies.** Do NOT build a format-abstraction /
  capability / registry / "asset" layer over it. If we ever swap gltf-transform, we refactor then —
  not now.
- **No** phases, **no** per-node memoization, **no** clone-for-fan-out (the MVP graph is linear and
  doesn't mutate). Don't add them speculatively.

## Package

Scaffold a new dev package `@dev/node-assets` (published `@babylonjs/node-assets`), modeled on
`packages/dev/smartFilters` and `packages/dev/lottiePlayer`:

- `package.json` (private `@dev/node-assets`, `"test": "vitest run"`, `"type": "module"`, depends on
  `@dev/core` and `@dev/build-tools`), plus `tsconfig.json` / `tsconfig.build.json` like smartFilters.
- Add **gltf-transform** as a dependency: `@gltf-transform/core` (and `@gltf-transform/extensions` for
  extension IO). It is not yet used anywhere in the repo — you are adding it. Load it via **dynamic
  import** inside the block bodies so it stays out of the base bundle.
- `src/index.ts` barrel exporting the public surface.

## The node system (convention-aligned, KISS)

Mirror the SmartFilters foundation. Intended shapes (names/types may be refined; keep the roles and the
naming rhythm):

```ts
// connection/nodeAssetConnectionPointDirection.ts
export enum NodeAssetConnectionPointDirection { Input, Output }

// connection/nodeAssetConnectionPointType.ts
// One type for the MVP — the payload is a gltf-transform Document. The enum exists so more types
// (USD, image) can be added later without reshaping anything.
export enum NodeAssetConnectionPointType { GLTF }

// connection/nodeAssetConnectionPoint.ts
export class NodeAssetConnectionPoint {
    readonly name: string;
    readonly type: NodeAssetConnectionPointType;
    readonly direction: NodeAssetConnectionPointDirection;
    readonly ownerBlock: NodeAssetBlock;
    /** For an input: the upstream output it is connected to. */
    connectedPoint: Nullable<NodeAssetConnectionPoint>;
    /** Runtime payload set during build (a gltf-transform Document for GLTF). */
    value: unknown;
    /** Called on an OUTPUT point, connecting it to an INPUT point. Rejects bad direction / type. */
    connectTo(input: NodeAssetConnectionPoint): void;
    get isConnected(): boolean;
}

// blockFoundation/nodeAssetBlock.ts
export abstract class NodeAssetBlock {
    readonly name: string;
    readonly uniqueId: number;
    get inputs(): ReadonlyArray<NodeAssetConnectionPoint>;
    get outputs(): ReadonlyArray<NodeAssetConnectionPoint>;
    getClassName(): string;
    protected _registerInput(name: string, type: NodeAssetConnectionPointType): NodeAssetConnectionPoint;
    protected _registerOutput(name: string, type: NodeAssetConnectionPointType): NodeAssetConnectionPoint;
    /** Runtime hook: inputs' `value`s are already resolved; read them and set this block's outputs' `value`s. */
    abstract _buildBlockAsync(): Promise<void>;
}

// nodeAsset.ts — the graph
export class NodeAsset {
    name: string;
    get attachedBlocks(): ReadonlyArray<NodeAssetBlock>;
    /** Runs the graph by pulling from the terminal ExportGLTFBlock; returns the deliverable bytes. */
    buildAsync(): Promise<Uint8Array>;
}
```

Blocks:

```ts
// Blocks/importGLTFBlock.ts
export class ImportGLTFBlock extends NodeAssetBlock {
    /** Source glTF/glb bytes to import (set by the caller / editor file picker). */
    data: Nullable<Uint8Array>;
    readonly output: NodeAssetConnectionPoint; // GLTF
    // _buildBlockAsync: dynamic-import gltf-transform, build a WebIO with extensions registered,
    // read `data` (readBinary) into a Document, set output.value = document.
}

// Blocks/exportGLTFBlock.ts
export class ExportGLTFBlock extends NodeAssetBlock {
    readonly input: NodeAssetConnectionPoint; // GLTF
    /** The exported bytes; also returned by NodeAsset.buildAsync(). */
    result: Nullable<Uint8Array>;
    // _buildBlockAsync: read the connected Document from input, writeBinary via WebIO to a glb
    // Uint8Array, set result.
}
```

**Execution (`NodeAsset.buildAsync`):** locate the terminal `ExportGLTFBlock`; pull-evaluate its
upstream dependencies (each input's `connectedPoint.ownerBlock` built first), calling
`_buildBlockAsync()` in dependency order; return the export block's `result`. Pull-based, no caching. A
required input left unconnected is an error.

**Code-API ergonomics (what issue 02's editor will call — keep this pleasant):**

```ts
const asset = new NodeAsset("roundtrip");
const importer = new ImportGLTFBlock("import", asset);
importer.data = bytesFromFilePicker;
const exporter = new ExportGLTFBlock("export", asset);
importer.output.connectTo(exporter.input);
const glb = await asset.buildAsync(); // roundtripped bytes
```

## gltf-transform specifics

- Browser IO: `WebIO` from `@gltf-transform/core`. `io.readBinary(Uint8Array) → Promise<Document>`;
  `io.writeBinary(Document) → Promise<Uint8Array>` (produces a `.glb`).
- Register extensions so the roundtrip does not silently drop data: register the extension set from
  `@gltf-transform/extensions` on the IO (verify the exact export name against the installed version).
  Compressed extensions (Draco/meshopt) need decoder dependencies — the MVP roundtrip is uncompressed,
  so pick a test asset that doesn't require them, or skip registering those specific ones. Keep it
  minimal.
- The shapes above are the intended surface, not a frozen signature — confirm the exact API against
  the installed gltf-transform version.

## Tests (vitest, headless — follow `.github/instructions/tests.instructions.md`)

Model on `packages/dev/lottiePlayer/test/unit` (a small dev package with vitest units). Test external
behavior, not internals:

- Building a `NodeAsset` of ImportGLTFBlock → ExportGLTFBlock over a small fixture `.glb` produces
  non-empty bytes.
- The exported bytes re-parse into a valid glTF (through gltf-transform, and/or Babylon's glTF loader
  with a `NullEngine`) with the expected structure (e.g. same mesh / node count) — i.e. a real
  roundtrip, not a passthrough of the input buffer.
- `connectTo` rejects a mismatched direction (output→output) and an incompatible type; `buildAsync`
  errors on a missing required input.
- If bundling a binary fixture is impractical headless, build a trivial Document in code, export it,
  re-import it, and assert a couple of properties survive.

## Acceptance criteria

- [ ] New dev package `@dev/node-assets` builds, laid out like `packages/dev/smartFilters` /
      `lottiePlayer`.
- [ ] gltf-transform is added as a dependency and used only inside the glTF block bodies, via dynamic
      import.
- [ ] `NodeAssetBlock`, `NodeAssetConnectionPoint` (+ direction / type enums), and `NodeAsset` exist,
      mirroring the SmartFilters / NodeMaterial conventions and the shapes above.
- [ ] `ImportGLTFBlock` and `ExportGLTFBlock` exist; `output.connectTo(input)` connects them.
- [ ] `NodeAsset.buildAsync()` runs an import→export graph and returns glb bytes that re-parse into a
      valid glTF (a genuine gltf-transform read/write roundtrip).
- [ ] No registry, capability layer, phase, format abstraction, memoization, or clone-for-fan-out is
      present — the code is the shallow, direct version.
- [ ] The code API is ergonomic for the editor to drive (construct blocks, set import bytes, connect,
      `buildAsync()` → bytes), per the snippet above.
- [ ] `src/index.ts` exports the public surface (`NodeAsset`, `NodeAssetBlock`, the connection point +
      enums, the two blocks).
- [ ] Headless vitest tests cover the roundtrip, connection validation, and the missing-input error,
      and pass.
- [ ] `npm run lint:check` and `npm run format:check` pass for the new package.

## Blocked by

None — start immediately. Independent of issue 00 (which builds the editor UI against dummy data).
