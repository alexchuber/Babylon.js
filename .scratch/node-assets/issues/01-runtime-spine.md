# Runtime spine — glTF in → glTF out through the operation registry

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## What to build

The end-to-end spine of NodeAssets: a graph definition that imports a glTF and exports a glTF, run
by a registry-driven runtime — no compression yet, but every seam the later slices hang off is in
place.

Scaffold a new dev package published as `@babylonjs/node-assets`, modeled on the existing
`lottiePlayer` dev package. In it, build:

- **The operation registry** — the single source of truth. An operation is registered once with an
  id, a label, its input **ports** (each a name plus a format type), an output type, default
  settings, an optional **phase**, and a `run` function. The runtime, and later the editor palette
  and code API, all read from this one registry so the surfaces can never drift.
- **Two operations** — an import-glTF **source** (zero inputs) and an export-glTF **sink**
  (terminal). Together they prove the source→sink path.
- **The graph definition** — the serialized, decoupled recipe: a list of nodes (each with an id, an
  operation type, and its settings) plus a list of edges. This is distinct from the wire payload:
  the payload flowing between nodes is a gltf-transform `Document` (the **asset**), reused as-is;
  the graph definition is the separate, saved pipeline recipe.
- **The runtime** — resolves operations from the registry and executes a graph definition in
  topological order, and produces the output glTF bytes. Before a mutating node runs it clones its
  input asset (via a per-format clone **capability**, not by calling gltf-transform directly) so a
  future fan-out branch can't corrupt its siblings.
- **The gltf-transform containment discipline** — the orchestration layer (runtime, registry,
  graph definition) stays **gltf-transform-free**: it treats the asset as an opaque glTF-format
  payload and never references gltf-transform types. gltf-transform is confined to the operation
  implementations (import, export, and later transforms) plus a small set of per-format glTF
  **capabilities** (read bytes → asset, asset → bytes, clone-for-fan-out). This is a containment
  discipline, not a formal pluggable-backend interface: the point is that gltf-transform could be
  swapped for an in-house glTF backend later by rewriting those operations + capabilities, without
  touching the orchestration layer. Do not build a speculative backend interface for the PoC.
- **Promote the domain glossary.** Move `.scratch/node-assets/CONTEXT.md` into the new package as
  `packages/dev/nodeAssets/CONTEXT.md`, and create a root `CONTEXT-MAP.md` registering it (the
  repo's domain-vocabulary convention — see `docs/agents/domain.md`). Use its terms in code and tests.

Heavy libraries (gltf-transform) load via dynamic import so the base bundle stays small.

## Contracts (build to these shapes)

Build the spine's three inherited contracts — the **operation registry**, the **graph definition**,
and the **per-format capability set** — to these shapes (identical to the PRD's "runtime-spine
contracts" section). 02 / 03 / 04 / 05 all depend on them, so getting the roles right matters more
than the exact code. Names and types may be refined, but preserve the roles and the containment
boundary: orchestration never reaches inside an `Asset`.

```ts
// ---- Shared vocabulary ----

/** A format that can flow along a wire. glTF only in milestone 1; the union grows later. */
type AssetFormat = "gltf" | "usd" | "image";

/** A whole-asset payload on a wire. OPAQUE to orchestration (containment): only the per-format
 *  capabilities and operation bodies know what `payload` is — for "gltf" it is a gltf-transform
 *  Document. The runtime never reaches inside `payload`. */
type Asset = { readonly format: AssetFormat; readonly payload: unknown };

/** Whether an operation edits content or compresses. Drives "compression comes last". */
type Phase = "content" | "compression";

/** A named, typed input on a node. */
type PortDef = { readonly name: string; readonly format: AssetFormat };

// ---- 1. Operation registry (the single source of truth) ----

/** What an operation emits: another asset, or the final serialized bytes (a sink). */
type OperationOutput =
    | { readonly kind: "asset"; readonly format: AssetFormat }
    | { readonly kind: "bytes" };

type OperationRunContext<TSettings> = {
    /** Upstream assets already resolved, keyed by this operation's input port name. */
    readonly inputs: ReadonlyMap<string, Asset>;
    readonly settings: TSettings;
};

/** A registry entry. Functional — no class per operation.
 *  - A SOURCE has `inputs: []` and reads its bytes from `settings` (e.g. a File/URL/Uint8Array).
 *  - A SINK has `output: { kind: "bytes" }`; its `run` returns the deliverable Uint8Array.
 *  - Everything else returns an `Asset`. */
type OperationDefinition<TSettings = Record<string, unknown>> = {
    readonly id: string;                  // stable type id, e.g. "importGltf"
    readonly label: string;               // palette label
    readonly inputs: readonly PortDef[];
    readonly output: OperationOutput;
    readonly phase?: Phase;               // defaults to "content"
    readonly defaultSettings: TSettings;
    readonly run: (ctx: OperationRunContext<TSettings>) => Promise<Asset | Uint8Array>;
};

type OperationRegistry = {
    register: <TSettings>(def: OperationDefinition<TSettings>) => void;
    get: (operationId: string) => OperationDefinition | undefined;
    list: () => readonly OperationDefinition[];   // drives the editor palette
};

// ---- 2. Graph definition (the saved, decoupled recipe) ----

/** A placed instance of an operation. `settings` are merged over the op's `defaultSettings`. */
type GraphNode = {
    readonly id: string;
    readonly operationId: string;
    readonly settings: Record<string, unknown>;
};

/** A typed connection: one node's single (whole-asset) output → a named input port on another. */
type GraphEdge = { readonly from: string; readonly to: string; readonly toPort: string };

type GraphDefinition = {
    readonly version: number;             // schema version, for save/load migration
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
};

// ---- 3. Per-format capability set (the ONLY gltf-transform touch-point in the spine) ----

/** Everything orchestration needs to handle one format without knowing its internals. Swapping
 *  gltf-transform later = reimplement this for "gltf"; the runtime/registry/graph stay untouched. */
type FormatCapabilities = {
    readonly format: AssetFormat;
    readonly deserialize: (bytes: Uint8Array) => Promise<Asset>;   // bytes → asset (import)
    readonly serialize: (asset: Asset) => Promise<Uint8Array>;     // asset → bytes (Draco encodes HERE, at write-time)
    readonly clone: (asset: Asset) => Asset;                       // deep copy for fan-out (gltf: cloneDocument(src), NOT document.clone())
};
```

## Acceptance criteria

- [ ] A new dev package builds and is laid out like the existing `lottiePlayer` dev package.
- [ ] An operation can be registered once and resolved by the runtime from the registry.
- [ ] Running a graph definition of import-glTF → export-glTF produces output glTF bytes that load
      back through the Babylon glTF loader.
- [ ] The runtime executes nodes in topological order and clones each mutating node's input so a
      fan-out branch does not corrupt its siblings.
- [ ] The orchestration layer (runtime, registry, graph definition) references no gltf-transform
      types; gltf-transform lives only in operation bodies + per-format glTF capabilities, so it
      could be swapped for an in-house backend without touching orchestration.
- [ ] gltf-transform is loaded via dynamic import, not bundled into the base package.
- [ ] Headless vitest tests cover registry resolution, topological execution, clone/fan-out safety,
      and the import→export round-trip. (Prior art: the `lottiePlayer` dev-package unit tests.)
- [ ] The operation registry, graph definition, and per-format capability set match the roles in the
      "Contracts" section above (names/types may be refined; the containment boundary must hold —
      orchestration references no gltf-transform types).
- [ ] `.scratch/node-assets/CONTEXT.md` is promoted to `packages/dev/nodeAssets/CONTEXT.md`, and a
      root `CONTEXT-MAP.md` registers it per `docs/agents/domain.md`.

## User stories covered

PRD stories 2, 6, 23, 24, 26, 27, 28, 33.

## Blocked by

None — can start immediately.
