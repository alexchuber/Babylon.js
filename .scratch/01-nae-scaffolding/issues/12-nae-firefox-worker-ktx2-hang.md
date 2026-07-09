# 12 — NAE build hangs in a Web Worker on Firefox (KTX2/Basis encode never completes)

Status: resolved

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion". Discovered while
implementing issue 11 (move the node-asset build into a Web Worker). Glossaries:
`packages/tools/nodeAssetsEditor/CONTEXT.md` · `packages/dev/node-assets/CONTEXT.md` · `CONTEXT-MAP.md`.

## Why this is its own slice

Issue 11 moved the whole `NodeAsset.buildAsync()` into a Web Worker and fixed the main-thread freeze on
Chrome. During that work, a **Firefox-specific** defect surfaced that is orthogonal to the responsiveness
win and was explicitly scoped out of issue 11: on Firefox, the worker's KTX2/Basis encode does **not
complete**. This slice is the investigation-and-remedy for that Firefox behavior. It is deliberately
separate so the Chrome responsiveness win can land without waiting on a Firefox browser-engine
investigation.

## What to build

**Investigate why the worker build never finishes on Firefox, then remedy it.** The observed behavior
(from issue 11 diagnostics):

- Chrome, in-worker: BoomBox build completes in ~31 s, main thread stays responsive.
- Firefox, in-worker: import succeeds, the same-origin Basis encoder WASM loads, image decode
  begins and completes for the textures — then the Basis encode never returns (exceeded 300 s with no
  result). The main thread stays responsive throughout (heartbeat healthy), so this is a worker-side
  compute stall, not a UI freeze.
- Firefox, on the old main-thread path (pre-worker): the same KTX2 encode was pathologically slow
  (~400 s) but did eventually complete.

Determine the root cause — candidates include Firefox `OffscreenCanvas` WebGL2 readback behavior inside a
worker, Basis Universal WASM behavior in a Firefox module worker, or genuinely pathological slowness that
merely looks like a hang within the test window. Then either make the Firefox worker build complete in a
reasonable time, or, if it is intractable in the current encoder, land a **graceful degradation** (a
clear user-facing message and/or a documented Firefox limitation) so the tool fails loudly rather than
appearing to hang.

Note: this is **not** about making KTX2 generally faster (that remains out of scope, as in issue 11) —
it is specifically about the Firefox worker path not completing.

## Acceptance criteria

- [x] Root cause of the Firefox worker KTX2/Basis stall is identified with evidence (which stage stalls,
      and why it differs from Chrome and from the old Firefox main-thread path).
- [x] Either: the Firefox worker build completes for the default BoomBox graph in a reasonable time and
      the NAE Playwright suite can run green on Firefox; or: a documented decision plus graceful
      degradation (clear surfaced error / documented Firefox limitation) instead of an apparent hang.
- [x] No regression to the Chrome worker path (still completes, still responsive, preview ≡ export).
- [x] `lint:check` + `format:check` pass; headless unit tests green.

## Blocked by

- `.scratch/01-nae-scaffolding/issues/11-build-in-web-worker.md` — the worker build path must be in place
  to investigate its Firefox behavior.

## Resolution

**Root cause (not a deadlock).** The KTX2/Basis UASTC encode in `ktx2-encoder@0.5.3` is a single-threaded,
synchronous WASM compute. Its glue (`dist/web/BrowserBasisEncoder.js`) and `dist/basis/basis_encoder.wasm`
contain **zero** `Worker` / `SharedArrayBuffer` / `Atomics` / `pthread` / `emscripten_futex` markers, so
there is no cross-thread synchronization that could deadlock. Firefox's WASM engine (SpiderMonkey) runs
this particular Basis build ~an order of magnitude slower than Chrome's V8 (~400 s vs ~31 s for BoomBox).
The stall is inside `BasisEncoder.encode()` (one synchronous WASM call), **not** image decode — the
OffscreenCanvas WebGL2 readback completes. Issue 11's move to a Web Worker did not introduce the hang: it
removed the UI freeze (the win) while leaving the pathological Firefox encode time in place, so the build
now runs invisibly past every practical/test timeout and merely *appears* to hang. The old main-thread
path ran the same ~400 s encode but froze the UI, so the user saw it grind and eventually finish; the
worker keeps the UI responsive, so there is no visible progress and it silently exceeds the ~300 s
observation window (300 s < 400 s — fully consistent with "same slow encode, window too short").

**Decision.** Firefox is a **documented known limitation** for the NAE KTX2 build path. The NAE Playwright
suite's CI browser default is switched from Firefox to **Chromium** (scoped to only the `nodeAssetsEditor`
project in `packages/tools/tests/playwright.utils.ts`; all other suites keep their existing browsers). We
do **not** attempt to make KTX2 faster on Firefox (explicitly out of scope) or change encoder quality/codec
blind (unsafe to validate without a Firefox environment).

**Graceful degradation (fail loud, don't hang).** `NodeAssetBuildWorkerClient` now runs a main-thread
**build watchdog** (`DefaultNodeAssetBuildTimeoutMs = 240_000` — well above Chrome's ~31 s so no Chrome
regression, below Firefox's ~400 s pathology; injectable via the constructor). If a build does not respond
within the budget, the runaway worker is `terminate()`d (freeing the pegged CPU core) and the build rejects
with a dedicated `NodeAssetBuildTimeoutError` whose message names Firefox's KTX2/Basis slowness and suggests
a Chromium-based browser or removing the KTX2 Compress node. That rejection already flows through
`BuildScheduler.onBuildFailed` → `preview.setStatus(false, message)` → the existing `preview-error-overlay`
(`role="alert"`), so real Firefox users get a clear, actionable error instead of an apparent hang.

**Tests.** Headless fake-timer unit tests in
`packages/tools/nodeAssetsEditor/test/unit/nodeAssetBuildWorkerClient.test.ts` cover: watchdog fires →
rejects `NodeAssetBuildTimeoutError` + worker terminated; fast success → no stale timeout, worker not
terminated; a superseding build cancels the prior timer (superseded build rejects with
`NodeAssetBuildSupersededError`, latest build times out on its own timer). The Chrome worker success path,
latest-wins, and preview ≡ export are unchanged.
