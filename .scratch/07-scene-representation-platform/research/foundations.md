# Foundations — primary-source research for the scene-representation platform

> **What this is.** The evidence base for milestone 07 (`docs/adr/0004`–`0006`, the PRD, and the issues in
> `../issues/`). Two kinds of sources, kept strictly separate:
>
> - **Repository source of truth** — facts verified by reading this repo's code (with file paths + symbols
>   and, where relevant, the branch they live on). These are authoritative for the design.
> - **External background / prior art** — public specs, libraries, and projects, cited by URL/repo. These
>   inform the design but are **not** Babylon source of truth. Marked _(external)_.
>
> Nothing here is fabricated. Where a source could not be verified it is listed under **Uncertainties**.
> Two background audits underpin this report; their raw output is not committed, but every load-bearing
> claim below is re-cited to a file path or URL.

---

## 1. Repository source of truth

### 1.1 The USD loader POC (branch `alexchuber-feat-loaders-usd-loader`)

A dependency-free, TypeScript USD loader exists on `alexchuber-feat-loaders-usd-loader` (not yet on
`dev`). It is the basis for the milestone-07 `USD_STAGE` representation and the USD2Babylon transcoder.

- **`IResolvedStage` / `IResolvedDiagnostic`** — `packages/dev/loaders/src/USD/resolution/resolvedStage.ts`.
  `IResolvedStage` is **plain data only**: `metadata` (`IStageMetadata`), a synthetic `root` prim, flat
  pooled `meshes` / `materials` / `skeletons` arrays (referenced by index for instancing/prototypes), and
  a `diagnostics: IResolvedDiagnostic[]`. The file's own contract comment states: _"Pure, plain data only.
  NO Babylon imports, NO USD-runtime objects, NO functions"_ and that every USD semantic (composition
  arcs, variants, xformOp stacks, primvar interpolation, time samples, value clips, splines) is **already
  resolved** before these objects are produced. `IResolvedDiagnostic` is `{ severity: "info" | "warning" |
  "error"; message: string; path?: string }`.
  - **Nuance (repo fact):** the interface is a **plain-data contract**, documented as immutable-by-usage
    (the adapter consumes without mutating), but it is **not** `Object.freeze`d at runtime today. ADR 0005
    and the PRD speak of a "frozen" `IResolvedStage`; that is a **design intent** (freeze/immutability the
    build scope should enforce or the `UsdAsset` wrapper should guarantee), not a property the current POC
    enforces. Tracked as a hardening item (see `../issues/`).
- **`ResolveUsdStageAsync`** — `packages/dev/loaders/src/USD/resolution/usdResolver.ts`:
  `ResolveUsdStageAsync(data: ArrayBuffer | string, rootUrl: string, fileName: string | undefined,
  options: Readonly<USDLoadingOptions>): Promise<IResolvedStage>`. Format is detected by magic bytes
  (`#usda` ASCII, `PXR-USDC` crate, `PK` zip/usdz), not extension. Parsers are all in-repo: `usda/`
  (ASCII), `crate/` (binary crate, incl. inline LZ4 + integer decoders), `usdzArchive` (zip). Composition
  is resolved via `composition/composeLayerStack` then mapped by `mapping/stageMapper`.
  - **Dependency nuance:** the resolution **core** is dependency-free and Babylon-free through
    `ResolveUsdStageWithFetcherAsync` (an injectable fetcher). The convenience wrapper
    `ResolveUsdStageAsync` uses Babylon's `Tools.LoadFileAsync` as the default external-asset fetcher, so
    the public convenience entry does touch Babylon `Tools`. The dependency-free story is accurate for the
    resolution algorithm; the default fetcher is the one Babylon coupling.
- **`AdaptResolvedStageToScene`** — `packages/dev/loaders/src/USD/adapter/usdAdapter.ts`:
  `AdaptResolvedStageToScene(stage: IResolvedStage, scene: Scene, assetContainer: Nullable<AssetContainer>,
  options: Readonly<USDLoadingOptions>): ISceneLoaderAsyncResult`. Submodules: `geometryAdapter`,
  `materialAdapter`, `transformAdapter`, `skinningAdapter`, `animationAdapter`, `instancingAdapter`,
  `lightCameraAdapter`, `sceneGraphAdapter`. It performs **zero USD reasoning** — it maps resolved data
  onto Babylon nodes/meshes/materials/lights/cameras/animations. This is the exact function ADR 0004 names
  for the **USD2Babylon** transcoder.
- **Handedness (repo fact, load-bearing).** `packages/dev/loaders/src/USD/adapter/transformAdapter.ts`
  `CreateStageRoot(...)` sets **`scene.useRightHandedSystem = true`** and only rotates the root for USD
  Z-up (`-90°` about X) and scales by `metersPerUnit`. Its comment: _"keeping Babylon in right-handed mode
  preserves USD-authored positions, cameras, normals, and triangle winding **without per-vertex/index
  conversion**."_ Geometry uses USD's authored winding via `mesh.sideOrientation` (no index flips). This
  directly substantiates ADR/PRD requirement R9 (dynamic, preserved handedness; RH scenes; no per-vertex
  flips).
- **Tests.** `packages/dev/loaders/test/unit/USD/` on that branch has **23 test files** totaling **81
  `it(` cases** (crate/usda/usdz parsers, sdf, composition, stage mapper, and every adapter). The brief's
  "80 tests" is accurate to ±1.
- **Dependencies/licenses.** The loader adds **no new npm dependency** (`packages/dev/loaders/package.json`
  `dependencies: {}` on that branch); crate LZ4 and usdz zip are implemented in-repo. The alternate,
  pre-existing USD path — the tinyusdz WebAssembly transcoder in
  `packages/dev/node-assets/src/Blocks/tinyUsdzTranscoder.ts` / `importUSDBlock.ts` — remains available and
  is **Apache-2.0** (stated in `importUSDBlock.ts`, linking `github.com/lighttransport/tinyusdz`). ADR 0004
  and the PRD keep it as hidden/deprecated compatibility-only.
- **Declared limitations (repo grep, `TODO`/`unsupported`/diagnostics).** Unsupported USD `xformOp` types →
  `warning` diagnostic (`mapping/transformMapping.ts`); unsupported light schemas (`CylinderLight`,
  `DomeLight`) → `info` (`mapping/stageMapper.ts`); material networks beyond base fall back to base color
  (`mapping/materialMapping.ts`); unsupported crate versions / float compression codes **throw**
  (`parser/crate/crateReader.ts`); unsupported `upAxis` → diagnostic (`usda/usdaParser.ts`). Fatal problems
  throw; non-fatal ones are collected as `IResolvedDiagnostic`. This split is the model for the PRD's
  fatal-vs-`LossRecord` semantics.

### 1.2 The NodeAssets runtime today (this branch)

- **Type system.** `packages/dev/node-assets/src/connection/nodeAssetConnectionPointType.ts` defines a flat
  enum with **exactly** `SCENE, NUMBER, STRING, JSON, IMAGE`. (Note: the current `CONTEXT.md` prose listed a
  `BYTES` kind, but the actual enum does **not** contain `BYTES` — corrected in the milestone-07 glossary
  update.) A connection point carries `public value: unknown = null` and a `readonly type`; `connectTo`
  rejects mismatches with strict kind-equality (`connection/nodeAssetConnectionPoint.ts`). This is the
  surface ADR 0004/0005 extend: add `GLTF_DOCUMENT`/`USD_STAGE`/`BABYLON_SCENE`/`NODE_GEOMETRY`, keep the
  flat equality check, replace the opaque `value` for the 3D kinds with typed wrappers.
- **Build/evaluation.** `packages/dev/node-assets/src/nodeAsset.ts` `buildAsync()` finds the terminal
  export block (`IsExportBlock`) and **pull-evaluates** upstream. Evaluate-once is a per-build `Map<block,
  Promise>` memo populated synchronously before `await` so fan-in dedupes onto one in-flight promise.
  Copy-on-fan-out lives in `evaluation/fanOutCopy.ts`: `CloneForFanOutAsync` clones **only** `SCENE`
  payloads (via `@gltf-transform/functions` `cloneDocument`) and only when `connectedPoints.length > 1`;
  scalars/IMAGE are shared by reference. **There is no cancellation, resource/time limit, disposal ledger,
  or worker/transferable mechanism today** — confirmed by absence. This is exactly the gap ADR 0005's build
  scope (PRD R4/R8) fills, and it makes per-representation fan-out policy (R4.2) a natural generalization of
  the existing SCENE-only clone rule.
- **The SCENE payload** is a `@gltf-transform/core` `Document` used directly, no wrapper (e.g.
  `getProperty.ts` `this.scene.value as Nullable<Document>`; `mergeScenes.ts` `mergeDocuments`). Imports
  span `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`. This is why the
  `GLTF_DOCUMENT` representation is value-like and clones cheaply.
- **Selector/accessor.** `selector/pointerToAccessor.ts` `ResolvePointerToAccessor(document, pointer)`
  resolves a glTF Object Model JSON Pointer (`/<collection>/<index>/<propertyPath>`) to an
  `IPropertyAccessor` = `{ type; get(); set(value); getTarget() }`, with a texture-slot specialization
  (`ResolvePointerToImageAccessor`) that reads/writes encoded image bytes. This is the ADR 0003 triad the
  glTF domain keeps; ADR 0006 re-frames it as the glTF domain's **address form** of a versioned selection.
- **BuildPBRMaterial.** `Blocks/buildPBRMaterial.ts` assembles a PBR material by calling gltf-transform
  APIs **directly on the `Document`** (`document.createMaterial()...setBaseColorFactor(...)`,
  `document.createTexture().setImage().setMimeType()`), mutating in place. It is glTF-shaped throughout
  (metallic-roughness factors, glTF texture-slot names) — hence ADR 0005/PRD R7's "decompose per
  representation for new graphs, keep the legacy glTF path."
- **Block inventory (~30 user-facing blocks).** Import/Export glTF; Import USD (tinyusdz); Import/Export
  Image; MergeScenes; operators (dedup, prune, weld, quantize, simplify, flatten, center, normals, join);
  Draco/KTX2 compression; image ops (convert, resize, flip, composite); Selector/Get/SetProperty;
  Extract/SetTexture; BuildPBRMaterial; Number/String/Json literals. Milestone 07 retypes these onto
  `GLTF_DOCUMENT`, adds transcoders, and keeps operators/Merge (PRD compatibility).

### 1.3 Mature glTF ↔ Babylon paths (this branch)

- **glTF 2.0 loader** — `packages/dev/loaders/src/glTF/2.0/glTFLoader.pure.ts`, class `GLTFLoader`
  (`RegisterGLTF2Loader()`), full spec + KHR extension coverage. Names the **glTF2Babylon** transcoder
  engine (PRD R3.2). On load it sets `scene.useRightHandedSystem = true`.
- **glTF 2.0 exporter** — `packages/dev/serializers/src/glTF/2.0/glTFExporter.ts`, class `GLTFExporter`,
  with per-KHR-extension exporters. Names the **Babylon2glTF** transcoder engine. Handles left-handed
  Babylon scenes by inserting coordinate-flip nodes on export; right-handed scenes need no flip — matching
  the "handedness preserved" model (PRD R9).

---

## 2. External background & prior art _(not Babylon source of truth)_

### 2.1 glTF is a delivery target, not an authoring format _(external)_

Khronos glTF 2.0 spec (`KhronosGroup/glTF:specification/2.0/Specification.adoc`, CC-BY-4.0): _"glTF is an
API-neutral runtime asset delivery format"_; it is a _"'transmission' format… a different design goal than
typical 3D 'authoring' formats,"_ and explicitly _"not an authoring format. glTF deliberately does not
retain 3D authoring information."_ Coordinate system: **right-handed, +Y up, +Z forward, meters**
(`§coordinate-system-and-units`). This is the spec-level justification for ADR 0004's "glTF is the sole
terminal, a poor universal working representation but the correct export target."

### 2.2 glTF-Transform _(external)_

`gltf-transform.dev` (repo `donmccurdy/glTF-Transform`, **MIT**). Packages `@gltf-transform/core`
(`Document`/`Property` directed-graph model), `@gltf-transform/functions` (dedup, prune, weld, quantize,
simplify, flatten, join, draco, meshopt, textureCompress, …), `@gltf-transform/extensions`. Its docs note
the `Document` graph _"is useful for efficient loading … but [glTF is] cumbersome for direct editing —
which … is generally the domain of interchange formats like COLLADA or USD."_ It targets **glTF 2.0 only** —
consistent with it being the `GLTF_DOCUMENT` representation, not a universal one.

### 2.3 OpenUSD _(external)_

`openusd.org` (repo `PixarAnimationStudios/OpenUSD`). USD is an _"interchange and augment[ation]"_ system
for scenes _"composed from many elemental assets,"_ supporting **non-destructive editing as overrides** and
a **single scenegraph** — a superset of glTF's expressive power. Concepts: **Stage** (composed scenegraph),
**Layer**, **Prim**, **composition arcs LIVRPS** (subLayers, Inherits, Variants, References, Payloads,
Specializes) resolved by strength ordering, **variants**, and the **flattened/composed stage**. This is
precisely what the USD loader's "resolution layer" collapses into `IResolvedStage`, and why USD→glTF is
lossy (composition/variants/layering cannot survive). Coordinate system: **right-handed**, `upAxis`
stage-metadata defaulting to **Y** (configurable to Z), `metersPerUnit` defaulting to **0.01 (cm)**
(`group___usd_geom_up_axis__group`, `group___usd_geom_linear_units__group`) — exactly the two conversions
the POC's `CreateStageRoot` applies.

- **License (verified, nuance):** OpenUSD is under the **Tomorrow Open Source Technology License 1.0
  (TOST 1.0)** — a modified Apache-2.0 differing only in Section 6 (Trademarks). It is **not** plain
  "Apache-2.0 with Pixar terms" (`OpenUSD:LICENSE.txt`). Relevant if OpenUSD code were ever vendored; the
  chosen POC path avoids this entirely (no OpenUSD/pxrUSD dependency).
- **tinyusdz (verified):** `github.com/lighttransport/tinyusdz`, **Apache-2.0**, self-contained C++14
  USDA/USDC/USDZ reader/writer, WASM-compilable, _"you don't need pxrUSD/OpenUSD."_ npm package `tinyusdz`.
  This is the already-present compatibility path (§1.1).

### 2.4 USD ↔ glTF conversion is established, and lossy both ways _(external)_

Well-known pairwise converters confirm this is standard practice and inherently lossy:
- `google/usd_from_gltf` (glTF→USDZ): frames glTF as _"transmission"_ vs USD _"interchange,"_ and states
  _"The emulation process is lossy"_ (e.g. doubling geometry for double-sided materials).
- `pablode/guc` (glTF→USD, Apache-2.0, MaterialX-based): _"all glTF features with the exception of animation
  and skinning are implemented."_
- Apple `usdzconvert` (glTF/OBJ/FBX→USDZ) for AR Quick Look.
- Root cause: **USD is a strict superset of glTF** (composition, subdivision, curves/NURBS, procedurals,
  overrides). Both directions approximate/discard. This validates ADR 0004's decision to keep every
  transcoder explicit and to surface a `LossRecord`.

### 2.5 glTF Object Model & JSON Pointer _(external)_

`KhronosGroup/glTF:specification/2.0/ObjectModel.adoc` defines JSON-pointer templates for addressing
mutable glTF properties (e.g. `/nodes/{}/translation` → `float3`, `/materials/{}/pbrMetallicRoughness/
baseColorFactor` → `float4`), built on **RFC 6901**. **`KHR_animation_pointer`** (Complete/**Ratified**)
animates _"any mutable property"_ via these pointers; **`KHR_interactivity`** (draft, PR #2435) reuses the
same addressing. This confirms ADR 0003/0006's selector grammar is a real Khronos standard, and scopes it
correctly as a **glTF-domain** mechanism.

### 2.6 Handedness across the three systems _(external + repo)_

| System | Handedness | Up | Units | Source |
|---|---|---|---|---|
| glTF | Right-handed | +Y | meters | glTF spec `§coordinate-system-and-units` _(external)_ |
| USD | Right-handed | +Y default (Z configurable) | 0.01 m default | OpenUSD upAxis/linearUnits API _(external)_ |
| Babylon | **Left-handed** default; RH via `useRightHandedSystem` | +Y | engine units | `packages/dev/core/src/scene.pure.ts` (`_useRightHandedSystem = false`) _(repo)_ |

Because both glTF and USD are right-handed and Babylon can opt into right-handed mode, USD/glTF → Babylon
adapters can create RH scenes and skip per-vertex flips — which is exactly what the USD POC does (§1.1) and
what PRD R9 requires.

### 2.7 "Polymorph" prior art — **not found by that name** _(external)_

The brief asks to include Polymorph as external prior art. **An extensive search did not locate any 3D
asset-pipeline / multi-representation project, paper, or repo publicly named "Polymorph"** (queried across
SIGGRAPH/Eurographics/ACM DL and major code hosts). It may be an internal/proprietary tool or an informal
talk not in public indices — recorded as an **uncertainty**, not fabricated. The *concept* it evokes is
well-covered prior art on N-format conversion topologies:

- **Hub-and-spoke** (one neutral IR, `2N` converters) — e.g. `assimp/assimp` (40+ importers → internal IR →
  exporters). This is the **spine** model milestone 07 is moving *away* from.
- **Pairwise** (direct A↔B, up to `N·(N−1)` converters).
- **Terminal-per-direction** (several import sources, one designated export sink) — glTF as the "last mile"
  sink. The `usd_from_gltf` README cites Nick Porcino's "last mile vs interchange" post
  (`nickporcino.com/posts/last_mile_interchange.html`) for exactly this distinction.

Milestone 07's shape — **three representations, explicit pairwise-ish transcoders, glTF the only terminal
sink, no mandatory neutral hub** — is a directed multi-node graph with a designated terminal. That is
consistent with established practice; it is deliberately **not** the assimp-style neutral-hub design.

---

## 3. Dependency & license decisions

- **USD import (new graphs):** the in-repo, **dependency-free** USD loader (§1.1). No new npm dependency,
  no OpenUSD/pxrUSD, no TOST-licensed code vendored. ✅ preferred.
- **USD import (legacy/compat):** tinyusdz WASM (**Apache-2.0**), already present, kept hidden/deprecated,
  pinned to the **exact existing version 0.9.9** (security acceptance does not bump/replace it).
- **glTF representation:** `@gltf-transform/*` (**MIT**), already a dependency. No change.
- **glTF ↔ Babylon:** in-repo mature loader/serializer. No new dependency.
- **Net new third-party runtime dependencies for milestone 07: none.** (PRD non-goal.) Any future FBX/OBJ/
  CAD importer must re-run provenance/license/vuln checks before adding a dependency.

---

## 4. Uncertainties / open questions

- **"Polymorph" (external):** not found by name (§2.7). If the brief refers to a specific project, its
  identity is unverified; treated as conceptual prior art only.
- **`IResolvedStage` immutability (repo):** a plain-data contract, **not** runtime-frozen today. ADR 0005's
  "frozen" is a design intent the `UsdAsset` wrapper / build scope must enforce — a hardening task, not a
  current guarantee.
- **`ResolveUsdStageAsync` Babylon coupling (repo):** the resolution core is Babylon-free, but the public
  convenience entry defaults to Babylon's `Tools.LoadFileAsync` fetcher. "Dependency-free" is accurate for
  the algorithm; the default fetcher is a coupling to keep in mind for worker/transferable design (R8).
- **USD2glTF is genuinely direct (decided, no longer an open choice).** It maps the frozen
  `IResolvedStage` **straight to a glTF `Document`** via a dedicated `AdaptResolvedStageToScene`-sibling
  mapper (e.g. `AdaptResolvedStageToDocument` / `gltfStageMapper.ts`) consuming the same `IResolvedStage`.
  It does **not** route through `BABYLON_SCENE` and does **not** call `AdaptResolvedStageToScene`. This
  matches §6, ADR 0004, PRD R3.2, and issue 05; the earlier "may compose USD2Babylon + Babylon2glTF"
  option is retired.
- **`KHR_interactivity` status (external):** draft/PR at research time — verify current ratification before
  relying on it.
- **Babylon docs deep-links (external):** several `doc.babylonjs.com` deep links 404'd during research;
  `useRightHandedSystem` was verified from source (`scene.pure.ts`) instead of docs.
- **USD loader landing (repo/process):** the loader is on `alexchuber-feat-loaders-usd-loader`, not `dev`;
  milestone-07 sequencing assumes it lands (or is ported) first (see the port/hardening issue).

## 5. Resolved decisions (TDD / security synthesis)

Two formerly-open items are now settled and reflected in ADR 0005, the PRD (R4/R9), and issue 06:

- **`BabylonAsset` is a live, build-owned `NullEngine` + `Scene` with dynamic handedness.** Consequence:
  it is **affine** (no implicit clone; explicit `LossyFork` only), and the acceptance bar **requires
  leak / cleanup / disposal tests** proving the engine and scene are disposed exactly once on both
  success and abort.
- **glTF→Babylon uses the existing loader's render-flag / scene-mode behavior**, with **no NAE vertex
  mutation**. Consequence: the `glTF2Babylon` transcoder tests assert **loader invocation and resulting
  scene-mode behavior**, not custom winding/handedness math (issue 06).

Security acceptance additionally **pins the exact existing `tinyusdz` 0.9.9**, and any CI workflow to run
the milestone-07 suites is **deferred/proposed only** — no `.github` workflow files without explicit user
approval (issue 11).

## 6. TDD / security synthesis — incorporated (session f47d5dcb)

The extreme-TDD / security / release-validation synthesis (Deliverables 1–8) confirms the architecture and
adds the following load-bearing decisions and findings, now reflected in the ADRs, PRD, and issues:

- **USD2glTF is genuinely direct.** A dedicated resolved-stage → glTF `Document` mapper (an
  `AdaptResolvedStageToScene` sibling, e.g. `AdaptResolvedStageToDocument` / `gltfStageMapper.ts`)
  consumes the **same** `IResolvedStage` as the Babylon adapter; USD2glTF does **not** route through
  `BABYLON_SCENE`. No representation is a hidden hub; spy tests assert the other adapter is never called.
  (ADR 0004; PRD R3.2; issue 05.)
- **Four-way fan-out dispatch.** Generalize `CloneForFanOutAsync`'s current two-branch logic into: (a)
  structural deep-copy for plain-data (`GltfAsset`; `UsdAsset` shares the frozen stage + copies the
  immutable overlay); (b) share-by-ref for scalars/`Image`; (c) **affine reject-or-explicit-fork** for
  `BabylonAsset`; (d) **serialize / no-build parse** for `NodeGeometryAsset`. (ADR 0005; issue 03.)
- **Precise payload shapes.** `GltfAsset` = live `Document`; `UsdAsset` = frozen plain `IResolvedStage` +
  immutable overlay (no WASM handle); `BabylonAsset` = live `NullEngine`+`Scene` (affine);
  `NodeGeometryAsset` = parsed unevaluated graph **plus** an optional frozen `VertexData` snapshot post-
  `Evaluate` (both states; does not collapse into `BabylonAsset`); `Image` = plain. (ADR 0005; PRD R1.3/R6;
  issues 05/07.)
- **Cancellation is required foundation pre-work** (not a gated gap): `buildAsync(signal?: AbortSignal)`,
  internal `AbortController`, cooperative abort, sibling-abort-on-first-failure, await-full-settlement/
  cleanup, one deterministic primary error. Plus **four explicit configurable limits** (per-source bytes,
  total-source bytes, block/evaluation count, wall-clock) with behavior-safe defaults and a
  "every-current-fixture-still-builds" regression. (ADR 0005; PRD R4/security; issue 03.)
- **Vocabulary (ADR 0004).** `import block` = bytes → one representation (0-in/1-out, e.g.
  `ImportUSDBlock`); `transcoder` = mid-graph representation → representation (1-in/1-out, no bytes). Two
  distinct terms.
- **LossRecord schema.** Fixed disposition enum `preserve | bake | drop | extension` + tag refinement,
  aligned with `IResolvedDiagnostic`; tags propagate across fan-out/merge/multi-hop. (ADR 0005; PRD
  diagnostics; issues 05/06.)
- **BabylonAsset disposal** tests are modeled on Babylon's own `@tools/memory-leak-tests` harness (not
  NAE's lightweight plain-object style): dispose-on-teardown, idempotent second-dispose, no leaked
  engine/scene on an unconsumed/rejected fork, and affine-fan-out enforcement. (Issues 06/11.)
- **glTF→Babylon reuses the loader's render-flag / scene-mode handedness** (`sideOrientation` /
  `useRightHandedSystem`), exactly as USD→Babylon reuses `AdaptResolvedStageToScene` — **NAE performs no
  per-vertex winding/normal mutation** for either pair; tests are invocation / scene-mode /
  side-orientation / round-trip only. (Issue 06.)
- **Three distinct handedness boundaries** (repo fact, gallery review): (a) the `BabylonAsset.scene`
  representation contract; (b) loader/root behavior; (c) the terminal GLB **Viewer preview** boundary —
  NAE's `previewController` sends the GLB to `CreateViewerForCanvas` **without** right-handed config, so
  the Viewer defaults **left-handed** and the glTF loader's AUTO mode applies a root rotation /
  negative-Z scale. The preview conversion is a boundary concern, **not** the representation payload and
  **not** per-vertex mutation. PRD R9 / AG9 assert all three **independently**; representation handedness
  is never inferred from preview. Physical metadata therefore carries four fields: source value, target
  value, conversion location/mechanism, and policy.
- **The one remaining open design question** is the concrete shape of a capturable `Selection` type; the
  selection *semantics* (owner/version/cardinality/remap-or-invalidate) are decided. (ADR 0006; issues
  04/05/06.)

### Real pre-existing findings surfaced by the synthesis

- **`Promise.all` sibling-race** in `nodeAsset.ts` `_doEvaluateBlockAsync`: an orphaned sibling promise can
  outlive a failed branch — cheap today (plain data), but becomes a **leak** once a sibling can hold a live
  `NullEngine`/`Scene`. Motivates issue 03's build scope + `allSettled` sibling cleanup.
- **No cancellation API and no import size/time/memory caps exist today** on any path — the gaps issue 03
  (cancellation/limits) and issue 11 (fuzz/limits) close.
- **`fast-check` is not assumed.** Deterministic **corpus mutation of existing fixtures** is the default
  fuzz strategy; adopting `fast-check` is a new dev dependency gated behind the dependency gate's 7-step
  vetting (independent Layer-0 prep) and not added without approval (issue 11).
- **tinyusdz 0.9.9 pin is proven correct** via API diff (both older and newer versions break the shipped
  transcoder); do not bump. (PRD security; issue 11.)

### Abandoned editor/gallery branch — review findings (do not use as foundation)

An independent review of a prior editor/gallery branch produced **seven high-confidence warnings**, now
promoted to editor acceptance criteria (PRD R10.4–R10.10; issues 09/10/11). The branch itself is
**abandoned and must not be referenced as an implemented foundation**; a forced-on shell Playwright test
failed at a missing `[data-testid=demo-gallery]` (baseline **4 passed / 8 skipped**). Editor work begins
**only after the real runtime block contracts exist** (issues 02–07). The seven:

1. One canonical production `DemoCatalog` source + a typed view-model adapter — no independent UI / schema
   / Playwright catalogs.
2. An explicit serialized NodeAsset graph type — never `ReturnType<NodeAsset['serialize']>` while
   `serialize()` returns `any`.
3. Physical metadata models **source and target convention values separately from conversion policy**.
4. Correlated (owner-discriminated) selection unions and a recursive JSON value type — no widened structs
   or `any`.
5. No skipped/shell Playwright tests — enable them and prove query-param/catalog injection, selectors,
   card selection, graph loading, and pipeline execution.
6. Domain colors use semantic Fluent / theme tokens — no raw hex.
7. Graph preview uses list / diagram accessibility semantics and hides decorative glyphs.
