# 11 — Run the node-asset build in a Web Worker

Status: resolved

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (Milestone 1 hardening;
stems from the NAE build-performance diagnosis) · Glossaries:
`packages/tools/nodeAssetsEditor/CONTEXT.md` (editor terms) · `packages/dev/node-assets/CONTEXT.md`
(runtime terms) · `CONTEXT-MAP.md`.

## Why this is its own slice

`NodeAsset.buildAsync()` — import parse, KTX2 Basis encode (ETC1S color + UASTC data), Draco encode at
export, and GLB write — currently runs **synchronously on the browser main thread**, even though the outer
API is `async`. On the default BoomBox graph the KTX2 UASTC pass alone blocks the main thread for ~23s
(measured largest heartbeat gap ~23.3s of a ~29.4s build), so the whole app freezes and the spinner cannot
even animate. Moving the build off-thread is the real fix for responsiveness. It is a self-contained
architectural change to how the editor invokes the build; it does not depend on the trigger-gating slice
(issue 10).

## What to build

**Move the whole build into a dedicated Web Worker.** The clean boundary is bytes-in / bytes-out: the
editor posts a **build request** to the worker, the worker runs the entire pipeline, and it posts back the
resulting GLB bytes (or a structured error). Do **not** try to isolate only the KTX2 step — blocks pass
live gltf-transform `Document` objects between each other, which are not cheaply transferable; the whole
`buildAsync` is the natural unit to relocate.

**Message contract.** The build request is the **serialized graph** (`NodeAsset.serialize()`), which
already embeds the imported source bytes (base64) and every block's settings, so no separate resource
channel is needed for v1. In the worker: reconstruct the graph via `NodeAsset.Parse` (it already
round-trips Import → KTX2 → Draco → Export, verified in issue 09), run `buildAsync`, and post back the GLB
bytes as a transferable `ArrayBuffer`. Errors come back as a serializable error result, surfaced through
the existing in-pane preview error state.

**Preserve existing semantics.** The auto-build scheduler and its spinner (issue 08) stay; the spinner now
overlays a genuinely non-blocking build. **Latest-wins** must hold across the worker boundary: a newer
build supersedes an in-flight one and a stale worker result never overwrites a newer preview (tag results
with a build generation, and/or terminate-and-respawn the worker). Preview and the Export-node download
both consume the worker's returned bytes, so **preview still equals export** (decision D1).

**Blast radius to handle.**

- **Worker bundling** in the NAE Vite config (a new worker entry plus its WASM sidecar assets).
- **In-worker WASM resolution:** pass a locally-served `wasmUrl` to the Basis encoder and a
  `locateFile` / `dracoEncoderWasmUrl` to Draco so the worker resolves both WASM binaries from the app's
  own origin instead of the encoder's hard-coded remote CDN default.
- **Image decode is already worker-safe:** the KTX2 encoder decodes source textures via `OffscreenCanvas`
  + `createImageBitmap` (`ktx2-encoder/dist/web/decodeImageData.js`), both available in workers — no
  DOM-canvas rewrite is required. Confirm worker **WebGL2** works in the NAE Playwright browser (Firefox);
  that is the main runtime risk to validate.

## Acceptance criteria

- [ ] The full build (import → KTX2 → Draco → export) runs inside a Web Worker; during a BoomBox build the
      **main thread stays responsive** (a main-thread heartbeat keeps ticking, the UI stays interactive,
      and the spinner animates) instead of hard-freezing.
- [ ] Opening the editor auto-builds via the worker and previews the exported BoomBox with **no console
      error** (spinner appears then clears).
- [ ] Selecting the Export node and clicking Export downloads a valid `.glb` **equal to the previewed
      bytes** (preview ≡ export).
- [ ] **Latest-wins holds across the worker:** a build started while another is in flight supersedes it,
      and a stale worker result never overwrites a newer preview.
- [ ] Both WASM binaries (Basis encoder + Draco encoder) load from a locally-served URL inside the worker,
      with no reliance on the encoder's remote-CDN default.
- [ ] `lint:check` + `format:check` pass; headless `node-assets` unit tests are green; the NAE Playwright
      suite is green with the worker-backed build (including on Firefox).

## Out of scope (noted for later)

- A **worker *pool*** to queue / parallelize multiple builds or block operations (à la Babylon's Draco
  encoder and KTX2 decoder pooling) — deferred as a future performance optimization once the single-worker
  path is proven.
- Making KTX2 itself **faster** (speed/quality presets, skipping passes). This slice is about UI
  responsiveness, not encode time; the ~30s encode cost is expected to remain.

## Blocked by

None — can start immediately. Independent of issue 10. Both slices touch the build-trigger / build-invocation
area of the editor service and controller, so coordinate lightly on merge (no hard dependency either way).
