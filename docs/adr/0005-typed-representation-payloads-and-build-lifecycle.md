# Typed representation payloads with a build-owned lifecycle

> **Status: accepted. Supersedes [ADR 0002](./0002-wire-payload-is-kind-plus-opaque-value.md)** (kind
> plus opaque, block-interpreted `value`).

Each of the three 3D representations flows as a **concrete typed payload wrapper** — `GltfAsset`
(wrapping a glTF-Transform `Document`), `UsdAsset` (wrapping a frozen `IResolvedStage` plus an
immutable Node Assets overlay), and `BabylonAsset` (owning a live `NullEngine` + `Scene`) — and their
**lifecycle is owned by a per-`buildAsync()` build scope**, not by the blocks. We chose typed wrappers
over ADR 0002's opaque `value` slot because the three payloads are no longer interchangeable
`Document`s: two of them own disposable, non-serializable, sometimes-large runtime resources (a live
engine/scene; frozen typed-array-backed stage data) whose creation, cloning, transfer, and disposal
must be coordinated centrally to stay correct under cancellation and fan-out. The flat *enum of kinds*
from ADR 0002 is kept for wire type-checking; only the payload behind the 3D kinds becomes typed and
lifecycle-managed.

## Precise payload shapes

- **`GltfAsset`** — a live glTF-Transform `Document`.
- **`UsdAsset`** — a **frozen, plain `IResolvedStage`** plus an **immutable overlay** (no WASM handle).
  The overlay is USD's layer/session-override home: overlay edits never mutate the frozen base, are
  visible when resolving through the asset but not on the base directly, and survive fan-out without
  leaking across branches.
- **`BabylonAsset`** — a live, build-scoped `NullEngine` + `Scene` (affine; dynamic handedness preserved).
- **`NodeGeometryAsset`** (a **resource**, not a representation) — owns a **parsed, unevaluated graph**
  plus an **optional frozen `VertexData` snapshot once `Evaluate` runs**; it carries **both** states and
  does **not** collapse into a `BabylonAsset` on `Evaluate` (that is the separate `Bake` step).
- **`Image`** — plain data (bytes + mime), unchanged.

## What the build scope owns

- **Typed values** for the three representations (the wrappers above), plus resources (`Image`,
  `NodeGeometryAsset`) and scalars (`NUMBER`/`STRING`/`JSON`).
- **Cancellation and fail-fast abort**: `buildAsync(signal?: AbortSignal)` with an internal
  `AbortController`, cooperative abort checks, **sibling-abort-on-first-failure**, await-full-settlement
  and cleanup before resolving/rejecting, and **one deterministic primary error** even under concurrent
  failures. (This makes cancellation required foundation pre-work and closes the `Promise.all`
  sibling-race, not a flagged gap.)
- **Explicit configurable build limits** with behavior-safe defaults (existing graphs must not start
  failing): per-source-asset bytes, total-source bytes, block/evaluation count, and wall-clock timeout —
  each raising a clear typed error on exceed, with verified cleanup on the triggered abort.
- **`allSettled` sibling cleanup**: when one branch fails, already-produced sibling outputs are still
  disposed rather than leaked.
- **A lifetime ledger / disposal**: every representation resource (engines, scenes, frozen stages,
  large buffers) is tracked and disposed exactly once at build end or on abort.
- **Large-input transferables**: big buffers move across the worker boundary as transferables rather
  than being copied.
- **Diagnostics and `LossRecord`**: a build-scoped diagnostics channel; `LossRecord` is a refinement of
  the USD loader's `IResolvedDiagnostic` shape (`severity` / `message` / optional `path`) with a fixed
  disposition enum **`preserve | bake | drop | extension`** plus tag refinement, used to report what a
  transcoder dropped/approximated. It aligns with `IResolvedStage.diagnostics` where the USD resolver is
  the source.
- **Affine Babylon fan-out**: a `BabylonAsset` is *affine* — it is not silently cloned on fan-out;
  duplicating a live scene is an **explicit lossy fork**, distinct from the value-like copy-on-fan-out
  used for glTF Documents.

## Consequences

- Copy-on-fan-out is now per-representation policy, not one rule — a **four-way dispatch** replacing the
  current SCENE-only clone: **(a) structural deep-copy** for plain-data kinds (`GltfAsset`'s `Document`;
  `UsdAsset`'s frozen stage — shared by reference with the immutable overlay copied); **(b)
  share-by-reference** for scalars and `Image`; **(c) affine reject-or-explicit-fork** for `BabylonAsset`
  (a live resource is **never** implicitly cloned; fanning it out is rejected or requires an explicit
  **lossy fork** block); **(d) serialize / no-build parse** for `NodeGeometryAsset` — its own category,
  distinct from both the plain-data structural copy and `BabylonAsset`'s affine reject.
- Blocks stop owning disposal. A block produces a typed payload registered with the build scope; the
  scope disposes it. This is what makes cancellation, limits, and sibling cleanup enforceable centrally.
- `BuildPBRMaterial` and similar assembly blocks are **decomposed per representation** for new graphs
  (a glTF-targeting builder writes into a `Document`; a Babylon-targeting builder builds a `Material`),
  while the legacy glTF parsing path is kept for milestone 01–06 compatibility.
- The worker/transferable protocol is defined by the build scope, so representation payloads have a
  single, testable serialization boundary rather than each block inventing one.
