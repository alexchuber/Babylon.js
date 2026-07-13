# PRD — 07 Scene-representation platform

> Milestone 07 of the NodeAssets platform. Retires the single **SCENE spine** (ADR 0001) and replaces it
> with **three first-class 3D representations** — glTF, USD, and Babylon — connected by **explicit named
> transcoders**, with glTF as the sole export terminal. This is the representation/lifecycle/selection
> re-platforming that lets USD- and Babylon-native pipelines exist without paying glTF's loss on import.
>
> Decisions: `docs/adr/0004` (three representations / glTF terminal), `docs/adr/0005` (typed payloads /
> build-owned lifecycle), `docs/adr/0006` (domain-owned versioned selections). Glossary:
> `packages/dev/node-assets/CONTEXT.md`, `packages/tools/nodeAssetsEditor/CONTEXT.md`. Foundations:
> `.scratch/07-scene-representation-platform/research/foundations.md`.

## Problem Statement

Milestones 01–06 funnel every 3D format through one normalized gltf-transform `Document` — the SCENE
spine (ADR 0001). That was the right POC call, but it has a fatal ceiling for the platform we actually
want: **the loss happens on import, before the user has done anything.** A USD stage's composition,
variants, and layering are gone the instant `ImportUSD` transcodes it to glTF; a Babylon scene's runtime
constructs can't even enter the graph. glTF is a delivery ("last mile") format by charter — a poor
universal working representation but the correct export target. Anyone who wants to *edit USD as USD*,
*build a Babylon scene and tweak it live*, or *round-trip glTF↔Babylon* cannot, because there is only
one in-graph shape and it is the lossiest of the three.

We also have two facts on the ground that change the calculus: a **dependency-free USD loader**
(`ResolveUsdStageAsync` → `IResolvedStage`, plus `AdaptResolvedStageToScene`, ~81 unit tests) on
`alexchuber-feat-loaders-usd-loader`, and **mature glTF↔Babylon** paths (the glTF 2.0 `GLTFLoader` and
the `GLTFExporter`). The pieces for pairwise transcoding already exist; the graph just can't hold more
than one representation.

## Solution

Make the graph hold **three first-class in-graph 3D representations with no common supertype**:

- **`GLTF_DOCUMENT`** — a `GltfAsset` wrapping a gltf-transform `Document` (value-like).
- **`USD_STAGE`** — a `UsdAsset` wrapping a frozen, dependency-free `IResolvedStage` plus an immutable
  Node Assets **overlay** (shared, edits are overlays).
- **`BABYLON_SCENE`** — a `BabylonAsset` owning a live `NullEngine` + `Scene` per build (affine).

Connect them only through **four explicit, named transcoders** — **USD2glTF**, **USD2Babylon** (via
`AdaptResolvedStageToScene`), **glTF2Babylon** (via `GLTFLoader`), **Babylon2glTF** (via `GLTFExporter`)
— and keep **glTF as the only export terminal**. Give the build a **build scope** that owns typed
payload lifecycle (cancellation, limits, disposal ledger, transferables, diagnostics, `LossRecord`,
affine fan-out). Make **selections domain-owned and versioned**. Ship a **gallery of eight demos** and
the editor descriptors/diagnostics to drive them.

No implicit conversion, generic representation wire, union/`Switch`, mandatory neutral hub, or multi-hop
path planner in v1.

## User Stories

1. As a USD author, I want to import a `.usd`/`.usda`/`.usdc`/`.usdz` file into a **USD_STAGE**
   representation using the dependency-free USD loader, so that I work with USD data, not a glTF
   approximation of it.
2. As a USD author, I want a **USD2glTF** transcoder so I can deliver a USD asset as a glTF/glb, with a
   clear report of what USD semantics were dropped.
3. As a USD author, I want a **USD2Babylon** transcoder (using the loader's `AdaptResolvedStageToScene`)
   so I can preview and edit a USD stage as a live Babylon scene.
4. As a Babylon developer, I want a **glTF2Babylon** transcoder so I can turn a glTF representation into a
   live Babylon scene and use Babylon-native APIs on it.
5. As a Babylon developer, I want a **Babylon2glTF** transcoder so I can export a Babylon scene as glTF —
   the only export terminal.
6. As a pipeline author, I want each representation to be its **own typed port kind** (its own color),
   so that a lossy conversion is always a visible transcoder node and never an implicit wire.
7. As a pipeline author, I want to **edit a USD stage as immutable overlays** (retarget a material,
   override a transform) so my edits compose without mutating the resolved stage.
8. As a pipeline author, I want **domain-owned, versioned selections** so that when a mutator restructures
   a representation my selections are remapped or explicitly invalidated, not silently dangling.
9. As a pipeline author, I want a **NodeGeometry** resource that imports unevaluated, an explicit
   **Evaluate**, and a **Bake** to a Babylon representation, so procedural geometry is deliberate and
   inspectable.
10. As a pipeline author, I want fan-out to respect each representation's nature: glTF cloned, USD shared
    (immutable), Babylon **affine** with an explicit **lossy fork** when I really want a copy.
11. As a user of long builds, I want **cancellation, time/resource limits, and guaranteed disposal**, so
    a heavy or runaway build can be aborted and never leaks a live engine or large buffer.
12. As a user, I want **diagnostics and LossRecords surfaced on the offending node**, so I can see what a
    transcode approximated or dropped.
13. As a user, I want **handedness preserved and exposed** (`scene.useRightHandedSystem`), so USD/glTF →
    Babylon needs no per-vertex flips and a `.babylon` keeps its authored mode.
14. As a graph author, I want big buffers to move across the worker boundary as **transferables**, so
    large inputs don't get copied and stall the build.
15. As a new user, I want a **gallery of ready-made demos** covering all three representations and every
    transcoder, so I can see the platform work end to end and adapt it.
16. As an existing (milestone 01–06) user, I want my graphs and snippets to **keep working**: `SCENE`
    still resolves (as an alias for `GLTF_DOCUMENT`), the glTF operators and Merge are unchanged, and
    Draco/BasisU are relabeled but class-compatible.

## Requirements

### R1 — Representations & type system

- R1.1 Add representation kinds `GLTF_DOCUMENT`, `USD_STAGE`, `BABYLON_SCENE` to
  `NodeAssetConnectionPointType`; add `NODE_GEOMETRY` as a resource kind. Keep the flat, kind-equality
  `connectTo` check. **No common scene supertype, union, or `Switch`.**
- R1.2 `SCENE` is retained **only** as a deprecated alias for `GLTF_DOCUMENT` (accepts existing wires;
  emits a deprecation diagnostic). Nothing new emits `SCENE`.
- R1.3 Each representation flows as a typed payload wrapper: `GltfAsset` (wraps `Document`), `UsdAsset`
  (wraps frozen `IResolvedStage` + immutable overlay, no WASM handle), `BabylonAsset` (owns `NullEngine`
  + `Scene`). The `NODE_GEOMETRY` **resource** is a `NodeGeometryAsset` wrapper that owns a parsed,
  **unevaluated** graph plus an **optional frozen `VertexData` snapshot once `Evaluate` runs** (it carries
  both states; it does not collapse into a `BabylonAsset` on `Evaluate`). `Image` stays plain.
- R1.4 Resource lanes are editor grouping/metadata only — never a type-system or selection axis.

### R2 — Import blocks (bytes → representation)

- R2.1 `ImportGLTF` → `GLTF_DOCUMENT` (existing, retyped from `SCENE`).
- R2.2 A USD import for new graphs → `USD_STAGE` via `ResolveUsdStageAsync`/`IResolvedStage` (the
  dependency-free loader). The legacy tinyusdz `ImportUSDBlock` (USD→glTF spine) is **hidden/deprecated,
  compatibility-only** — retained, not deleted, not surfaced in the palette by default.
- R2.3 `ImportNodeGeometry` → `NODE_GEOMETRY`, **unevaluated**.

### R3 — Transcoders (representation → representation)

- R3.1 Exactly four v1 transcoders: **USD2glTF**, **USD2Babylon**, **glTF2Babylon**, **Babylon2glTF**.
  Each is an explicit palette node under a **Transcoders** category.
- R3.2 `USD2Babylon` uses `AdaptResolvedStageToScene`; `glTF2Babylon` uses the glTF 2.0 `GLTFLoader`;
  `Babylon2glTF` uses `GLTFExporter`. **`USD2glTF` is genuinely direct**: a dedicated resolved-stage →
  glTF `Document` mapper (an `AdaptResolvedStageToScene`-sibling, e.g. `AdaptResolvedStageToDocument` /
  `gltfStageMapper.ts`) consuming the **same** `IResolvedStage` as the Babylon adapter — it does **not**
  route through `BABYLON_SCENE`. No representation is a hidden hub; spy tests assert the other adapter is
  never called.
- R3.3 Every transcoder emits `LossRecord`s for approximated/dropped semantics. **No implicit
  conversion, generic wire, mandatory hub, or path planner.**
- R3.4 glTF is the **only** export terminal; there is no USD or Babylon export block in v1.

### R4 — Build scope, lifecycle, cancellation

- R4.1 A per-`buildAsync()` **build scope** owns typed values, cancellation, `allSettled` sibling cleanup,
  a lifetime ledger, and single-disposal of every representation resource (engines, scenes, frozen stages,
  large buffers). Cancellation is **required foundation pre-work**: `buildAsync(signal?: AbortSignal)` with
  an internal `AbortController`, cooperative abort checks, **sibling-abort-on-first-failure**,
  await-full-settlement and cleanup before resolving/rejecting, and **one deterministic primary error**
  even under concurrent failures (this closes the `Promise.all` sibling-race).
- R4.1a **Explicit configurable build limits** with behavior-safe defaults (existing graphs must not start
  failing): per-source-asset bytes, total-source bytes, block/evaluation count, and wall-clock timeout.
  Each raises a clear typed error on exceed with verified cleanup on the triggered abort; a regression
  proves every current fixture still builds under the defaults.
- R4.2 Fan-out policy is a **four-way dispatch**: `GltfAsset` structural-clone (`cloneDocument`);
  `UsdAsset` shared frozen stage + copied immutable overlay; `BabylonAsset` **affine** — no implicit
  clone, explicit **lossy fork** only; `NodeGeometryAsset` cloned via **serialize / no-build parse** (its
  own category). Scalars and `Image` share by reference.
- R4.3 On abort or fatal error, in-flight work is cancelled and already-produced siblings are disposed
  (`allSettled`), never leaked — including any live `BabylonAsset`/`NodeGeometryAsset` an aborted sibling
  was holding.

### R5 — Selections (domain-owned, versioned)

- R5.1 A selection carries `owner` (glTF/USD/Babylon), `version`, `targetKind`, `cardinality`,
  `addresses`. It is valid only against its owner's payload at a compatible version.
- R5.2 glTF selections use glTF Object Model JSON Pointers (ADR 0003 triad unchanged). USD selections use
  prim/property paths as **immutable overlay selectors**. Babylon selections use scene-object references.
- R5.3 Mutators **remap or invalidate**: a block that restructures a representation updates the versions
  and addresses of live selections it affects, or marks them invalid with a diagnostic.
- R5.4 A selection is a **first-class, capturable wire value** in the typed value map: a graph can capture
  it and flow it on a wire. It is **routable / fan-out within its own owner domain** and **rejected
  cross-domain**. Only the non-observable **TypeScript encoding** (interface/class, discriminated
  union/boxing) is implementation-owned; the observable behavior above is fixed acceptance (ADR 0006).

### R6 — NodeGeometry

- R6.1 Import produces a `NodeGeometryAsset` with a parsed, **unevaluated** graph. An explicit `Evaluate`
  runs the procedural graph and adds a **frozen `VertexData` snapshot** to the asset (both states coexist;
  no collapse into `BabylonAsset`). A separate `Bake` produces a `BabylonAsset`. Selections over
  NodeGeometry resolve only after `Evaluate`. Fan-out clones the asset via **serialize / no-build parse**.

### R7 — Materials

- R7.1 `BuildPBRMaterial` is **decomposed per representation** for new graphs: a glTF-targeting builder
  writes into a `Document`; a Babylon-targeting builder builds a Babylon `Material`. The **legacy glTF
  parsing path is kept** for milestone 01–06 compatibility.

### R8 — Workers & transferables

- R8.1 The build scope defines the worker/transferable protocol; large inputs cross the worker boundary
  as transferables, not copies. Representation payloads have a single, testable serialization boundary.

### R9 — Handedness (three separate boundaries)

Handedness is modeled and asserted at **three independent boundaries** — never conflated, and
representation handedness is **never inferred from preview rendering**:

- R9.1 **Representation contract (`BabylonAsset.scene`).** `USD→Babylon` and `glTF→Babylon` create/
  configure **right-handed** `BabylonAsset` scenes **without per-vertex winding/normal mutation**;
  `ImportBabylon` preserves the authored dynamic mode. The contract is asserted directly on
  `BabylonAsset.scene.useRightHandedSystem` (and side-orientation), independent of any preview.
- R9.2 **Loader / root behavior.** Where a transcoder relies on the mature loader's render-flag /
  root-node mechanism (root rotation / scene-mode), that behavior is asserted at the loader boundary —
  invocation and resulting scene mode — not by re-deriving geometry math in NAE.
- R9.3 **Terminal GLB Viewer preview boundary.** The preview is a **separate coordinate-conversion
  boundary**, not the representation payload: NAE's `previewController` sends the terminal GLB to
  `CreateViewerForCanvas` **without** right-handed configuration, so the Viewer defaults **left-handed**
  and the glTF loader's AUTO mode applies a root rotation / negative-Z scale. This is a preview-boundary
  conversion (not per-vertex mutation, not the `BabylonAsset` payload) and is asserted **independently**
  of the representation contract.
- R9.4 The editor/manifest **exposes** each boundary's mode separately; a `.babylon` representation
  preserves its authored mode. **Demo copy must not claim "native right-handed Babylon" unless the
  actual runtime path that produces a right-handed `BabylonAsset` is exercised.**

### R10 — Editor

- R10.1 Editor descriptors for all new representation ports (distinct colors), import blocks, transcoders
  (a **Transcoders** palette category), NodeGeometry Evaluate/Bake, and the decomposed material builders.
- R10.2 **Diagnostics surfacing**: build-scope diagnostics and `LossRecord`s render on the offending node
  and in a diagnostics list.
- R10.3 A **gallery** of the eight demos, openable and adaptable.
- R10.4 **One canonical production `DemoCatalog` source** feeds the gallery, plus a typed view-model
  adapter for the UI. No independent UI / schema / Playwright catalogs — tests and UI derive from the same
  source.
- R10.5 The serialized NodeAsset graph has an **explicit, named type**. The editor never types graph data
  as `ReturnType<NodeAsset['serialize']>` while `serialize()` returns `any`; the serialized shape is
  modeled explicitly (and `serialize()` is tightened to it).
- R10.6 **Physical metadata models four separate fields**: **source value**, **target value**,
  **conversion location/mechanism** (where and how the conversion happens — e.g. loader root node, Viewer
  preview boundary), and **policy** (the rule that maps source→target). These are never conflated into
  one value.
- R10.7 Selection and JSON typing are precise: selections are a **correlated (owner-discriminated) union**
  (not a widened struct), and JSON payloads use a **recursive JSON value type**, never `any`.
- R10.8 **No skipped/shell Playwright tests.** Gallery E2E is enabled and proves query-param / catalog
  injection, selectors, card selection, graph loading, and pipeline execution against real `data-testid`
  hooks (e.g. `[data-testid=demo-gallery]`).
- R10.9 Domain/representation colors use **semantic Fluent / theme tokens**, never raw hex.
- R10.10 Graph preview uses **list / diagram semantics** and hides decorative glyphs from the
  accessibility tree.

> **Abandoned editor branch.** A prior editor/gallery branch exists but is **abandoned** and MUST NOT be
> referenced as an implemented foundation. Independent review of it found the seven issues above (R10.4–
> R10.10); a forced-on shell Playwright test failed at a missing `[data-testid=demo-gallery]`, with a
> baseline of 4 passed / 8 skipped. Editor work (issues 09–11) begins **only after the real runtime block
> contracts exist** (issues 02–07), and re-implements the editor against those contracts — not by reviving
> the abandoned branch.

## Non-Goals (v1)

- No implicit/automatic conversion between representations; no generic "representation" wire; no
  union/`Switch` node; no mandatory neutral hub; no multi-hop transcode **path planner**.
- No common scene supertype shared by the three representations.
- No USD or Babylon **export** terminal (glTF only).
- No new third-party runtime dependency (the USD loader is dependency-free TypeScript; tinyusdz remains a
  compatibility-only, already-present option).
- No deletion of the legacy tinyusdz `ImportUSDBlock` or the legacy `BuildPBRMaterial` glTF path (kept for
  compatibility, hidden/deprecated where noted).
- No FBX/OBJ/CAD import in this milestone (the platform makes them *addable later* as import blocks, but
  they are out of scope for v1).
- No additional transcoders beyond the four named ones.
- Multi-target selection queries/wildcards remain a later, additive extension (cardinality is modeled;
  the query grammar is not built here).

## Compatibility

- **Wire alias.** `SCENE` accepts existing wires as an alias of `GLTF_DOCUMENT` and emits a deprecation
  diagnostic; milestone 01–06 graphs and Playground snippets still build.
- **Operators/Merge unchanged.** All glTF operator blocks (dedup, prune, weld, quantize, simplify,
  flatten, join, center, normals) and `MergeScenes` keep working on the glTF representation.
- **Draco/BasisU labels.** Palette labels become **Apply Draco** and **Apply BasisU** while keeping
  class-name compatibility (`DracoCompressionBlock` / `KTX2CompressionBlock` class names unchanged) so
  serialized graphs deserialize.
- **BuildPBRMaterial.** Legacy glTF assembly path retained; the decomposed builders are additive for new
  graphs.
- **Serialization.** Saved graphs referencing the old `SCENE`/`GLTF` kind load without edits.

## Diagnostics & Loss semantics

- **LossRecord** refines the USD loader's `IResolvedDiagnostic` (`severity: "info" | "warning" | "error"`,
  `message`, optional `path`) with a fixed disposition enum **`preserve | bake | drop | extension`**, the
  producing block/transcoder, and the representation-specific address of the dropped/approximated feature.
  Tags propagate across fan-out / merge / multi-hop.
- **Fatal vs non-fatal.** Fatal problems (invalid grammar, unsupported document version, missing required
  input) **throw** and fail the build (fail-fast abort). Non-fatal loss (unsupported USD xformOp/light
  schema, glTF-inexpressible USD composition, Babylon-inexpressible construct) is collected as a
  `LossRecord` and the build succeeds with loss.
- **Surfacing.** Diagnostics are build-scoped, returned with the build result, and rendered by the editor
  on the offending node and in a diagnostics list (R10.2). No lossy conversion is silent.
- **Documented loss profiles.** Each transcoder documents its loss profile (what it can never carry) in
  its issue and block doc-comment.

## Worker & lifetime behavior

- **Ownership.** Blocks produce typed payloads registered with the build scope; the **scope** disposes
  them. Blocks no longer own disposal.
- **Lifetime ledger.** Every engine/scene/frozen-stage/large-buffer is tracked and disposed exactly once
  at build end or on abort.
- **Cancellation.** An internal abort signal cancels in-flight async work; the first fatal error aborts
  siblings; `allSettled` guarantees already-produced siblings are still disposed.
- **Affine Babylon.** A `BabylonAsset` is never implicitly cloned; the only way to duplicate a live scene
  is an explicit **lossy fork** block.
- **Transferables.** Large inputs move across the worker boundary as transferables; the build scope owns
  the single serialization boundary for representation payloads.

## Security & Performance limits

- **Resource limits.** The build scope enforces **explicit, configurable limits with behavior-safe
  defaults**: per-source-asset bytes, total-source bytes, block/evaluation count, and a wall-clock timeout
  per build. Exceeding any limit raises a clear typed error and aborts cleanly (not a crash), disposing
  any live `BabylonAsset`/`NodeGeometryAsset` held; a regression proves every current fixture still builds
  under the defaults.
- **Untrusted input.** USD/glTF/image bytes are treated as untrusted: parsers must fail-fast on malformed
  input (the USD crate/usda/usdz readers already throw on invalid grammar/version), never hang, and never
  allocate unbounded from attacker-controlled counts. Fuzz coverage (see acceptance gates) exercises this.
- **No dynamic code from assets.** Asset-embedded scripts/expressions are never evaluated.
- **Disposal under failure.** A parse/transcode failure must not leak a live engine, scene, or WASM
  instance (guaranteed by R4).
- **Worker isolation.** Heavy parse/transcode runs off the main thread where the harness supports it;
  transferables bound copy cost.
- **Dependency pin.** The legacy USD compatibility path keeps the **exact existing `tinyusdz` version
  (0.9.9)**; security acceptance does not bump or replace it. No new third-party runtime dependency is
  added in v1.
- **CI wiring deferred.** Any CI workflow to run the golden/fuzz/visual/security suites is **proposed,
  not built**: no `.github` workflow files are added without explicit user approval (recorded as
  deferred acceptance work in issue 11).

## Editor gallery — eight demos

Each demo is a ready-made graph in the gallery, builds headlessly, and has visual/golden coverage.

1. **USD → glTF delivery.** ImportUSD(`.usdz`) → USD2glTF → Apply Draco → Apply BasisU → ExportGLTF.
   Exercises the USD loader import + USD2glTF + operators + terminal; asserts a valid glb and a LossRecord
   list for dropped USD semantics.
2. **USD → Babylon preview.** ImportUSD(`.usda`) → USD2Babylon → (Viewer preview). Exercises
   `AdaptResolvedStageToScene`; asserts a right-handed Babylon scene with **no per-vertex flips** and
   correct up-axis/units at the root.
3. **glTF ↔ Babylon round-trip.** ImportGLTF → glTF2Babylon → (Babylon-native edit) → Babylon2glTF →
   ExportGLTF. Exercises both glTF↔Babylon transcoders; asserts the edited property survives the round
   trip and handedness is preserved.
4. **USD overlay edit → glTF.** ImportUSD → (overlay: retarget a material / override a transform via a USD
   selection) → USD2glTF → ExportGLTF. Exercises immutable overlay selections; asserts the resolved stage
   is untouched and the overlay is reflected in the glTF output.
5. **Cross-representation material recompose.** ImportGLTF → ExtractTexture (IMAGE) → ResizeImage →
   BuildPBRMaterial (glTF-targeting) → ExportGLTF. Exercises the image lane meeting the glTF
   representation and the decomposed material builder; asserts the recomposed texture lands.
6. **Procedural geometry → Babylon → glTF.** ImportNodeGeometry → Evaluate → Bake (BabylonAsset) →
   Babylon2glTF → ExportGLTF. Exercises the NodeGeometry no-build/Evaluate/Bake path; asserts geometry is
   only built after Evaluate.
7. **Compose + fan-in.** MergeScenes( ImportGLTF, USD2glTF(ImportUSD) ) → prune → ExportGLTF. Exercises
   keeping glTF operators/Merge alongside a transcoder fan-in; asserts both sources appear and per-source
   selections stay addressable.
8. **Affine fork + handedness fidelity.** ImportGLTF → glTF2Babylon → **LossyFork** → (two Babylon-native
   edits) → Babylon2glTF ×2 → ExportGLTF. Exercises affine Babylon fan-out (explicit fork) and manifest
   handedness exposure; asserts the fork is the only way the scene duplicates and `useRightHandedSystem`
   is surfaced.

## Acceptance gates

- **AG1 — Representations & aliasing.** The three representation kinds + `NODE_GEOMETRY` exist; mismatched
  wires reject; `SCENE` resolves as a `GLTF_DOCUMENT` alias with a deprecation diagnostic; milestone
  01–06 example graphs and snippets still build. Tests-first (unit).
- **AG2 — Four transcoders, no more.** USD2glTF, USD2Babylon, glTF2Babylon, Babylon2glTF each build
  headlessly on a fixture; there is **no** generic conversion, union/`Switch`, hub, or path planner; glTF
  is the only export terminal. Tests-first (unit + integration).
- **AG3 — Build scope.** `buildAsync(signal?)` cancellation aborts an in-flight build with
  sibling-abort-on-first-failure and one deterministic primary error under concurrent failure; each of the
  four explicit limits (per-source bytes, total-source bytes, block/evaluation count, wall-clock) raises a
  clear typed error and aborts cleanly, and every current fixture still builds under the defaults; a
  lifetime-ledger test proves every representation/resource is disposed exactly once on success **and** on
  abort; `allSettled` sibling cleanup verified. Tests-first (unit).
- **AG4 — Fan-out policy (four-way).** `GltfAsset` clones (`cloneDocument`); `UsdAsset` shares the frozen
  stage and overlays don't stomp across branches; `BabylonAsset` requires an explicit LossyFork (no
  implicit clone); `NodeGeometryAsset` clones via serialize / no-build parse. Tests-first (unit).
- **AG5 — Selections.** A selection is a first-class capturable wire value; it routes/fans-out within its
  owner domain and is **rejected cross-domain**. A mutator remaps a live selection across a restructure,
  and invalidates one it cannot remap (with a diagnostic); a stale-version selection is caught, not
  silently mis-resolved. Only the TypeScript encoding is implementation-owned. Tests-first (unit).
- **AG6 — NodeGeometry.** Import builds no geometry; Evaluate produces a result; Bake yields a BabylonAsset;
  selections resolve only post-Evaluate. Tests-first (unit).
- **AG7 — Materials.** The decomposed glTF and Babylon material builders each produce the expected material;
  the legacy glTF path still passes its milestone-06 tests. Tests-first (unit).
- **AG8 — Diagnostics/loss.** Each transcoder emits the documented LossRecords on a lossy fixture; fatals
  throw; the editor renders diagnostics on the offending node. Tests-first (unit + editor test).
- **AG9 — Handedness (three boundaries).** (a) `USD→Babylon` and `glTF→Babylon` produce right-handed
  `BabylonAsset` scenes with **no per-vertex flips**, asserted on `scene.useRightHandedSystem`; (b)
  loader/root behavior is asserted at the loader boundary where applicable; (c) the terminal GLB **Viewer
  preview** mode is asserted **independently** (Viewer default LH + glTF loader AUTO root conversion) and
  representation handedness is **never inferred from preview**; `.babylon` preserves authored mode; the
  manifest exposes each boundary's mode. Demo copy never claims "native right-handed Babylon" unless the
  runtime path is exercised. Golden/visual + unit coverage.
- **AG10 — Workers/transferables.** Large-input builds move buffers as transferables (no copy) across the
  worker boundary; a protocol round-trip test passes. Tests-first (unit).
- **AG11 — Editor & gallery.** All new descriptors appear; the eight demos open, build, and preview; the
  Transcoders category and diagnostics surfacing work. One canonical `DemoCatalog` + typed view-model
  adapter feeds both UI and tests; the serialized graph uses an explicit named type (no `ReturnType`-of-
  `any`); physical metadata separates source/target convention from policy; selections are a correlated
  union and JSON is a recursive type; domain colors use Fluent/theme tokens (no raw hex); graph preview
  uses list/diagram semantics with decorative glyphs hidden. **No skipped/shell Playwright tests** — the
  gallery E2E is enabled and proves query-param/catalog injection, selectors, card selection, graph
  loading, and pipeline execution against real `data-testid` hooks. Editor tests + the eight demos. The
  abandoned prior editor branch is not used as a foundation.
- **AG12 — Golden/fuzz/Playwright/visual/security.** Golden fixtures for each transcoder; fuzz on the USD
  parser and transcoders (malformed input fails-fast, no hang/leak); Playwright/visual coverage for the
  eight demos; a security pass on untrusted-input handling and disposal-under-failure.
- **AG13 — Compatibility.** `format:check`, `lint:check`, `test:unit` pass; milestone 01–06 graphs,
  snippets, operators/Merge, and serialized Draco/BasisU blocks still work.

## Rollout / sequencing

Issues are branch/PR-sized and dependency-ordered in `.scratch/07-scene-representation-platform/issues/`.
The critical path is: USD loader port/hardening → typed representation/schema migration → build
scope/lifecycle → the domain slices (glTF, USD, Babylon, NodeGeometry) → transferables/workers → editor
descriptors/diagnostics → gallery/eight demos → golden/fuzz/Playwright/visual/security → final
architecture/code review. Each issue is tests-first with its own acceptance criteria and carries **no
outward PR/push**.
