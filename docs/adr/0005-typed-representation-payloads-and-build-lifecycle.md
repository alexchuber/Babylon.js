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

## What the build scope owns

- **Typed values** for the three representations (the wrappers above), plus resources (`IMAGE`,
  `NODE_GEOMETRY`) and scalars (`NUMBER`/`STRING`/`JSON`).
- **Cancellation and fail-fast abort**: an internal abort signal cancels in-flight work; the first
  fatal error aborts siblings.
- **Resource and time limits**: caps on memory/allocation and wall-clock per build.
- **`allSettled` sibling cleanup**: when one branch fails, already-produced sibling outputs are still
  disposed rather than leaked.
- **A lifetime ledger / disposal**: every representation resource (engines, scenes, frozen stages,
  large buffers) is tracked and disposed exactly once at build end or on abort.
- **Large-input transferables**: big buffers move across the worker boundary as transferables rather
  than being copied.
- **Diagnostics and `LossRecord`**: a build-scoped diagnostics channel; `LossRecord` is a refinement of
  the USD loader's `IResolvedDiagnostic` shape used to report what a transcoder dropped/approximated.
- **Affine Babylon fan-out**: a `BabylonAsset` is *affine* — it is not silently cloned on fan-out;
  duplicating a live scene is an **explicit lossy fork**, distinct from the value-like copy-on-fan-out
  used for glTF Documents.

## Consequences

- Copy-on-fan-out is now per-representation policy, not one rule: `GltfAsset` copies like a value
  (clone the `Document`); `UsdAsset` is immutable (share the frozen stage; overlays are additive and
  cheap to copy); `BabylonAsset` is affine (no implicit copy — an explicit fork block, marked lossy).
- Blocks stop owning disposal. A block produces a typed payload registered with the build scope; the
  scope disposes it. This is what makes cancellation, limits, and sibling cleanup enforceable centrally.
- `BuildPBRMaterial` and similar assembly blocks are **decomposed per representation** for new graphs
  (a glTF-targeting builder writes into a `Document`; a Babylon-targeting builder builds a `Material`),
  while the legacy glTF parsing path is kept for milestone 01–06 compatibility.
- The worker/transferable protocol is defined by the build scope, so representation payloads have a
  single, testable serialization boundary rather than each block inventing one.
