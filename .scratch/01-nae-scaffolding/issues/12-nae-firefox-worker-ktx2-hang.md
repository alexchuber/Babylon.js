# 12 — NAE build hangs in a Web Worker on Firefox (KTX2/Basis encode never completes)

Status: needs-triage

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

- [ ] Root cause of the Firefox worker KTX2/Basis stall is identified with evidence (which stage stalls,
      and why it differs from Chrome and from the old Firefox main-thread path).
- [ ] Either: the Firefox worker build completes for the default BoomBox graph in a reasonable time and
      the NAE Playwright suite can run green on Firefox; or: a documented decision plus graceful
      degradation (clear surfaced error / documented Firefox limitation) instead of an apparent hang.
- [ ] No regression to the Chrome worker path (still completes, still responsive, preview ≡ export).
- [ ] `lint:check` + `format:check` pass; headless unit tests green.

## Blocked by

- `.scratch/01-nae-scaffolding/issues/11-build-in-web-worker.md` — the worker build path must be in place
  to investigate its Firefox behavior.
