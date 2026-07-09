# 08 — Auto-build: scheduler + spinner/error, replace manual build

Status: resolved

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (this is **Slice 3** of
that effort) · Glossaries: `packages/tools/nodeAssetsEditor/CONTEXT.md` (editor terms) · `CONTEXT-MAP.md`.

## User stories covered

Addendum stories 3 (auto-build on open), 5 (rebuild on any change), 6 (debounce), 7 (latest-wins), 8
(spinner during rebuild), 9 (non-fatal in-pane error), 11 (export from the Export node's properties),
12 (download == preview bytes), 13 (remove redundant manual build button), 22 (scheduler unit tests).

## Why this is its own slice

It replaces "the user manually clicks build/export" with "the graph builds itself." The timing core (a
pure debounce + latest-wins scheduler) is unit-testable in isolation, and the editor wiring is a
self-contained change on top of the existing build + preview machinery. It needs *a* preview surface to
refresh, which already exists; it does not need the premade graph or the Draco fix.

## What to build

**A pure `buildScheduler` module.** Given a trigger source, a debounce interval, and an async build
function, it: debounces rapid triggers (~400 ms) into a single build; fires an immediate build on open;
and enforces **latest-wins** so that when a newer build starts, an older build's result is discarded
when it eventually resolves. No DOM or Babylon dependency — plain TypeScript, so it can be unit-tested
with fake timers.

**Wire it into the editor.** Subscribe the scheduler to the editor state's change signal (add / remove /
reorder a node, rewire, edit a property, re-import) plus the initial open. Each build runs the
controller's existing `buildAsync` and loads the result into the preview.

**Spinner + error.** While a build + load is in flight, show a translucent spinner overlay covering the
preview surface. On build failure, show a minimal in-pane error state in the preview area (no crash, no
silently-stale preview). Success clears both.

**Rationalize the toolbar / export.** Remove the redundant manual build/run ("Build and preview")
toolbar button — auto-build replaces it. Make the **Export node's** properties-pane Export button
download the **cached bytes from the last successful build** (identical to what the preview loaded)
rather than triggering its own fresh build. There is no separate toolbar export.

## Acceptance criteria

- [ ] A pure `buildScheduler` module exists with unit tests (fake timers, node env) proving: rapid
      triggers collapse into one build; open triggers an immediate build; a stale in-flight build's
      result is discarded once a newer build starts.
- [ ] Editing the graph in the editor (add / remove / reorder / rewire / property change / re-import)
      triggers an automatic rebuild whose result appears in the preview.
- [ ] A translucent spinner overlays the preview surface for the whole build + load span and clears on
      completion.
- [ ] A failed build shows a non-fatal in-pane error in the preview area (no crash, no stale preview).
- [ ] The redundant manual build/run toolbar button is gone.
- [ ] The Export node's properties Export button downloads the cached last-successful-build bytes; the
      downloaded glb equals the bytes the preview last loaded.
- [ ] `lint:check` + `format:check` pass; headless unit tests (including the new scheduler tests) are
      green.

## Blocked by

None — can start immediately. (Runs in parallel with issues 05 and 07; it is a hard blocker for
issue 09.)
