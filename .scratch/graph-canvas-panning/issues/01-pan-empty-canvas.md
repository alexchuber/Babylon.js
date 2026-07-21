Status: ready-for-agent

## Parent

`.scratch/graph-canvas-panning/PRD.md`

## What to build

Make the Node Assets Editor graph camera move when an author drags empty canvas with an unmodified primary pointer. Preserve modified-drag marquee selection, empty-canvas click deselection, middle-button and Space-plus-primary pan aliases, and all child graph interactions. The gesture must remain predictable across zoom levels, pointer types, canvas boundaries, cancellation, and multiple simultaneous pointers, with grab/grabbing feedback. Keep the change inside the existing generic node-graph interaction and camera seams. Panning is view state only and must not mutate NodeAssets graph data, create undo entries, or trigger builds.

## Acceptance criteria

- [x] Unmodified primary drag beginning on empty canvas pans rendered nodes, wires, frames, grid, and minimap viewport by the viewport-pixel pointer delta at every supported zoom.
- [x] Primary touch and pen drags use the same behavior; the initiating pointer exclusively owns the gesture until completion/cancellation.
- [x] Middle-button and Space-plus-primary pan aliases remain.
- [x] Shift/Control/Command primary drag retains additive marquee selection.
- [x] Primary click without movement on empty canvas clears selection; moved pan preserves selection.
- [x] Node drag, frame drag, port-to-wire drag, wire selection, context menus, palette drop, minimap navigation, initial fit, zoom-to-fit, and wheel zoom keep their behavior.
- [x] Pan continues outside the canvas and cancellation clears transient state without committing marquee/wire or leaving an editor interaction open.
- [x] Canvas uses `grab` idle and `grabbing` during pan without overriding child cursors.
- [x] Regression tests cover the gesture seam for routing, latching, completion, cancellation, and applicable pointer ownership; PR #29's RED-before-GREEN evidence is worker-reported rather than independently reproduced from GitHub history.
- [x] Playwright proves rendered primary-drag panning and representative node-drag + wheel-zoom behavior afterward.
- [x] Scoped units, focused Playwright, the Node Assets Editor deployment build, and applicable lint/format checks pass; the standalone package type-check baseline limitation is documented below.
- [x] `/code-review` has no unresolved high-confidence findings.
- [ ] The corrected lifecycle follow-up lands and root completes independent final validation and integration.

## Delivery status (pending integration)

The implementation is assembled on the PR #22 branch, but the issue remains `Status: ready-for-agent`. Root will set `Status: resolved` only after the corrected lifecycle follow-up lands and the final integration gates pass.

- PR #15 placed the initial implementation commit `2858fcff583192ddd14218f81dc7eab6cbbcb63c` on `feat/nae/graph-canvas-pan`; that feature-branch merge was not final product integration.
- PR #29 placed the ownership implementation head `2ccafbede2b3379b99c861b69c1829b0d31c38a2` on `fix/nae/graph-canvas-pan-owner-gates` through merge commit `a577d18736b7ad77e48b768b074c141eafcf5d97`.
- The current focused follow-up changes tests and tracker documentation only. Production-source changes are not part of this correction.

## Comments

### Initial implementation slice

[PR #15](https://github.com/alexchuber/Babylon.js/pull/15) added the initial implementation at `2858fcff583192ddd14218f81dc7eab6cbbcb63c`. Its worker reported gesture units `35/35`, focused Playwright `2/2`, targeted ESLint and Prettier, the Node Assets Editor deployment build, precommit checks, and clean dual-lens `/code-review`. The standalone package-wide `tsc` baseline was reported blocked by unrelated existing core/dependency diagnostics, including missing `XRHandedness`, with no changed-file diagnostics.

### Active gesture ownership slice

Root reopened the issue after review found that minimap navigation, wire selection, and context-menu selection could bypass the active gesture owner. [PR #29](https://github.com/alexchuber/Babylon.js/pull/29) addressed those escapes.

- Worker-reported RED on exact base `f5a284ded5b1176fbfb75faf97cafd2ecc929dfd`: the four ownership Playwright cases produced one retained pass and three expected failures (ordinary node collapse, aggregate expansion, and visible/actionable context menus), and the ContextMenu unit produced one expected failure because disabling left an open menu visible.
- Worker-reported GREEN at `2ccafbede2b3379b99c861b69c1829b0d31c38a2`: focused units `38/38`, focused ownership/existing-pan Playwright `5/5` with `--workers=1 --retries=0`, Node Assets Editor deployment build, full format/lint, and changed-file Prettier/ESLint/diff checks passed.
- The PR #29 worker reported automatic dual-lens `/code-review` clean after fixing a stale-element assertion and a React-portal pointer-routing escape. GitHub records no PR #29 check runs or reviews, so the RED/GREEN and review results above are explicitly worker-reported.
- The PR #29 worker also reported that standalone Node Assets Editor `tsc -b` was baseline-blocked by 23 missing built GUI/serializer/viewer modules, with no changed-file diagnostics; that probe was not reported as GREEN.
- PR #29 merged into the PR #22 branch as `a577d18736b7ad77e48b768b074c141eafcf5d97`; it did not resolve this tracker issue or complete root integration.

### Corrected lifecycle proof

An independent exact-range audit of `a577d18736b7ad77e48b768b074c141eafcf5d97` found that the browser tests used an orphan foreign touch move, mixed a real mouse stream with synthetic cancellation for an assumed pointer ID, and treated lost capture as a terminal event. The focused follow-up now uses complete, distinct streams: a synthetic touch owner; real foreign mouse down/move/up actions; separate touch pointerup and pointercancel cases; and lost capture with the owner button still down followed by the owner's inert eventual pointerup.

The corrected five-case Playwright command passed `5/5` with `--workers=1 --retries=0`; the gesture and ContextMenu units passed `36/36`; changed-test Prettier, ESLint, and the CRLF-aware diff check passed. The first local Playwright invocation discovered zero tests because `@tools/test-tools` had not yet been built; after building that prerequisite, the complete five-case rerun passed and is the only browser result counted here. Automatic dual-lens `/code-review` found no actionable Critical or Warning issues. Root's independent final validation/integration remains pending.
