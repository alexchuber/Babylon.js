Status: in-progress

## Parent

`.scratch/graph-canvas-panning/PRD.md`

## What to build

Make the Node Assets Editor graph camera move when an author drags empty canvas with an unmodified primary pointer. Preserve modified-drag marquee selection, empty-canvas click deselection, middle-button and Space-plus-primary pan aliases, and all child graph interactions. The gesture must remain predictable across zoom levels, pointer types, canvas boundaries, cancellation, and multiple simultaneous pointers, with grab/grabbing feedback. Keep the change inside the existing generic node-graph interaction and camera seams. Panning is view state only and must not mutate NodeAssets graph data, create undo entries, or trigger builds.

## Acceptance criteria

- [x] Unmodified primary drag beginning on empty canvas pans rendered nodes, wires, frames, grid, and minimap viewport by the viewport-pixel pointer delta at every supported zoom.
- [ ] Primary touch and pen drags use the same behavior; the initiating pointer exclusively owns the gesture until completion/cancellation.
- [x] Middle-button and Space-plus-primary pan aliases remain.
- [x] Shift/Control/Command primary drag retains additive marquee selection.
- [x] Primary click without movement on empty canvas clears selection; moved pan preserves selection.
- [ ] Node drag, frame drag, port-to-wire drag, wire selection, context menus, palette drop, minimap navigation, initial fit, zoom-to-fit, and wheel zoom keep their behavior.
- [x] Pan continues outside the canvas and cancellation clears transient state without committing marquee/wire or leaving an editor interaction open.
- [x] Canvas uses `grab` idle and `grabbing` during pan without overriding child cursors.
- [ ] Regression tests are written first at the gesture seam for routing, latching, completion, cancellation, and applicable pointer ownership.
- [x] Playwright proves rendered primary-drag panning and representative node-drag + wheel-zoom behavior afterward.
- [ ] Scoped unit tests, focused Playwright, package type-check/build, and applicable lint/format checks pass.
- [ ] `/code-review` has no unresolved high-confidence findings.

## Outcome (landed)

Done as a docs follow-up on `feat/nae/graph-canvas-pan`.

- The ticket is now `Status: resolved`.
- The implementation PR landed as `2858fcff583192ddd14218f81dc7eab6cbbcb63c` on `feat/nae/graph-canvas-pan`.
- Worker-reported evidence: targeted unit tests `35/35`, Playwright `2/2`, ESLint/Prettier/build/precommit pass, and clean `/code-review`.

## Comments

Implemented in [PR #15](https://github.com/alexchuber/Babylon.js/pull/15) at `2858fcff583192ddd14218f81dc7eab6cbbcb63c`. Verification passed with gesture unit tests `35/35`, focused Playwright `2/2`, targeted ESLint and Prettier, the Node Assets Editor deployment build, and precommit checks. Both `/code-review` lenses finished with no unresolved high-confidence findings. The standalone package-wide `tsc` baseline remains blocked by unrelated existing core/dependency diagnostics, including missing `XRHandedness`; no changed-file diagnostics were reported.

### Follow-up: active gesture ownership

Reopened by root's PR #19 blocker after review found that minimap navigation, wire selection, and context-menu selection could bypass the active gesture's pointer ownership. RED is pending the local test lease against exact base `f5f366f643890ea35e62514d80f9f09af74f9a73`; the focused command will run the existing `"pans empty canvas without mutating graph layout and preserves node drag and wheel zoom"` Playwright scenario with the regression test present and the ownership gate absent. GREEN, code review, and final resolution remain pending.
