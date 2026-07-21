Status: ready-for-agent

## Parent
`.scratch/graph-canvas-panning/PRD.md`

## What to build
Make the Node Assets Editor graph camera move when an author drags empty canvas with an unmodified primary pointer. Preserve modified-drag marquee selection, empty-canvas click deselection, middle-button and Space-plus-primary pan aliases, and all child graph interactions. The gesture must remain predictable across zoom levels, pointer types, canvas boundaries, cancellation, and multiple simultaneous pointers, with grab/grabbing feedback. Keep the change inside the existing generic node-graph interaction and camera seams. Panning is view state only and must not mutate NodeAssets graph data, create undo entries, or trigger builds.

## Acceptance criteria
- [ ] Unmodified primary drag beginning on empty canvas pans rendered nodes, wires, frames, grid, and minimap viewport by the viewport-pixel pointer delta at every supported zoom.
- [ ] Primary touch and pen drags use the same behavior; the initiating pointer exclusively owns the gesture until completion/cancellation.
- [ ] Middle-button and Space-plus-primary pan aliases remain.
- [ ] Shift/Control/Command primary drag retains additive marquee selection.
- [ ] Primary click without movement on empty canvas clears selection; moved pan preserves selection.
- [ ] Node drag, frame drag, port-to-wire drag, wire selection, context menus, palette drop, minimap navigation, initial fit, zoom-to-fit, and wheel zoom keep their behavior.
- [ ] Pan continues outside the canvas and cancellation clears transient state without committing marquee/wire or leaving an editor interaction open.
- [ ] Canvas uses `grab` idle and `grabbing` during pan without overriding child cursors.
- [ ] Regression tests are written first at the gesture seam for routing, latching, completion, cancellation, and applicable pointer ownership.
- [ ] Playwright proves rendered primary-drag panning and representative node-drag + wheel-zoom behavior afterward.
- [ ] Scoped unit tests, focused Playwright, package type-check/build, and applicable lint/format checks pass.
- [ ] `/code-review` has no unresolved high-confidence findings.

## Blocked by
None - can start immediately.
