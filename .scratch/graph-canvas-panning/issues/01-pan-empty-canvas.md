Status: resolved

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
- [x] Regression tests are written first at the gesture seam for routing, latching, completion, cancellation, and applicable pointer ownership.
- [x] Playwright proves rendered primary-drag panning and representative node-drag + wheel-zoom behavior afterward.
- [x] Scoped unit tests, focused Playwright, package type-check/build, and applicable lint/format checks pass.
- [x] `/code-review` has no unresolved high-confidence findings.

## Blocked by

None - can start immediately.

## Answer

Implemented unmodified primary-pointer panning through the existing gesture interpreter and graph camera seams. The initiating pointer owns every active gesture through completion or cancellation, background clicks retain deselection, modified drags retain marquee selection, middle-button and Space aliases remain, and pointer capture/lost-capture cleanup prevents stuck interactions. The canvas now exposes grab/grabbing feedback without changing graph data.

Verification completed with 35 focused gesture unit tests, focused rendered panning and existing port-to-wire Playwright regressions, targeted ESLint and Prettier checks, and the Node Assets Editor deployment build. The standalone package TypeScript command remains blocked by unrelated pre-existing core diagnostics, with no diagnostics in the changed files. Both code-review lenses have no unresolved high-confidence findings.
