Status: ready-for-agent

## Problem Statement
Authors working on a NodeAssets graph need to reposition the viewport frequently. The canvas already has a camera and pan gesture, but normal primary-button dragging on empty canvas does not invoke it. Requiring a middle button or a Space chord is hard to discover, unavailable on many touch devices, and inconsistent with Babylon's other graph editors.

## Solution
Dragging the empty canvas surface with the primary pointer moves the camera by the pointer's viewport-space delta. Modified primary drags retain marquee selection, while middle-button and Space-plus-primary panning remain supported. The active gesture owns one pointer until completion or cancellation, and the canvas provides grab/grabbing feedback without changing graph data.

## User Stories
1. As a graph author, I want to drag empty canvas with the primary mouse button, so that I can move to another part of a large graph without learning a hidden chord.
2. As a touch or pen user, I want a primary drag on empty canvas to move the viewport, so that panning does not require a middle mouse button.
3. As an experienced Babylon graph-editor user, I want the Node Assets Editor to follow the established drag-empty-space-to-pan convention, so that navigation feels familiar.
4. As a graph author, I want the canvas to follow my pointer one screen pixel per screen pixel at every zoom level, so that panning feels stable and predictable.
5. As a graph author, I want dragging to continue when my pointer temporarily leaves the canvas, so that long pans do not stop at the viewport edge.
6. As a graph author, I want a canceled pointer gesture to release cleanly, so that the canvas never remains stuck in a dragging state.
7. As a graph author, I want only the pointer that began a pan to control it, so that a second touch or unrelated pointer cannot jump the camera.
8. As a graph author, I want modified primary dragging to retain marquee selection, so that I can still select multiple nodes by region.
9. As a graph author, I want a primary click without movement on empty canvas to retain the current clear-selection behavior, so that navigation does not remove a familiar selection affordance.
10. As a graph author, I want dragging a node to continue moving the node rather than the camera, so that graph editing remains reliable.
11. As a graph author, I want dragging a frame to continue moving the frame and its member nodes rather than the camera, so that grouping workflows remain reliable.
12. As a graph author, I want dragging from a port to continue previewing and creating a wire, so that connection editing remains reliable.
13. As a graph author, I want selecting a wire to remain distinct from panning, so that wire actions are not accidentally converted into camera movement.
14. As a graph author, I want minimap navigation to remain distinct from canvas panning, so that clicking or dragging the minimap keeps its existing behavior.
15. As a graph author, I want wheel zoom to keep the world point under the cursor fixed after panning, so that navigation remains spatially coherent.
16. As a keyboard user, I want existing focus and keyboard shortcuts to remain unchanged, so that adding pointer navigation does not disrupt non-pointer workflows.
17. As a graph author, I want grab/grabbing cursor feedback over the pannable surface, so that the interaction is discoverable and its active state is clear.

## Implementation Decisions
- The pure gesture interpreter remains the source of truth for whether a background pointer press begins panning or marquee selection.
- An unmodified primary-button press on empty canvas begins a pan. A middle-button press and Space-plus-primary press remain pan aliases.
- A primary-button press with Shift, Control, or Command begins the existing additive marquee gesture.
- A pan records whether any non-zero movement occurred. Completing an unmoved primary-background pan clears selection; completing a moved pan does not alter selection.
- Camera translation uses viewport-local pixel deltas so movement remains one-to-one and independent of zoom.
- Child interactions keep priority: node, frame, and port handlers claim their gesture before the background handler; wire and minimap handlers keep their existing propagation behavior.
- The canvas tracks the initiating pointer identity and ignores move/up/cancel events from other pointers until the gesture ends.
- Pointer cancellation resets transient gesture state without committing a marquee or wire and safely closes any bracketed node/frame interaction.
- The canvas surface shows `grab` while idle and `grabbing` during an active pan. Existing child cursors retain precedence.
- Panning remains view-only state and does not mutate nodes, wires, frames, undo history, build scheduling, or persisted NodeAssets graph data.
- Wheel zoom, zoom-to-fit, initial fit, minimap navigation, keyboard shortcuts, and form-control exclusions remain unchanged.

## Testing Decisions

- Use the existing pure gesture-interpreter unit seam for deterministic tests of background routing, pan movement latching, no-movement selection clearing, completion, and cancellation.
- Use the existing Node Assets Editor Playwright seam for the highest-level regression: primary drag on verified empty canvas moves rendered graph content by the drag delta without changing node world positions or selection, then node dragging and wheel zoom still work.
- Exercise modified-drag marquee behavior at the interpreter seam and, where stable, at the browser seam.
- Cover pointer ownership/cancellation at the narrowest stable seam and avoid timing-based assertions.
- Follow existing package Vitest and Playwright conventions and run the smallest scoped checks that cover the change.

## Delivery Status

The feature and ownership fixes are assembled on the PR #22 branch, but this PRD intentionally remains `Status: ready-for-agent` until the corrected lifecycle tests land and root completes independent validation and integration.

- PR #29's implementation head `2ccafbede2b3379b99c861b69c1829b0d31c38a2` merged into `fix/nae/graph-canvas-pan-owner-gates` as `a577d18736b7ad77e48b768b074c141eafcf5d97`; this is branch-level assembly, not final product integration.
- The PR #29 worker reported RED on exact base `f5a284ded5b1176fbfb75faf97cafd2ecc929dfd` (ownership Playwright: one retained pass and three expected failures; ContextMenu unit: one expected failure), followed by GREEN at `2ccafbede2b3379b99c861b69c1829b0d31c38a2` (38/38 focused units and 5/5 focused Playwright, plus deployment build and lint/format checks).
- The worker also reported a clean issue-level dual-lens `/code-review`. PR #29 itself has no GitHub check runs or reviews, so those results remain worker-reported evidence rather than GitHub-hosted evidence.
- An independent exact-range audit then rejected the prior browser proof because several synthetic pointer streams were not physically complete. The focused test/docs follow-up replaces those streams without changing production source and passed its automatic dual-lens review; root's independent final gates and integration remain pending.

## Out of Scope
- Inertial or momentum panning.
- Pinch-to-zoom or multi-touch camera gestures.
- Trackpad two-finger scroll-to-pan; wheel remains zoom.
- Keyboard camera panning or new toolbar controls.
- Camera persistence.
- Zoom-limit, sensitivity, zoom-to-fit, initial-fit, or minimap-layout changes.
- Replacing the NAE canvas with the shared legacy graph canvas.
- Unrelated node, frame, port, wire, palette, or context-menu changes.

## Further Notes

The branch contains camera pan actions, viewport-space delta math, middle-button/Space panning, window-level pointer continuation, focused unit seams, and active-owner gates. The remaining work is to land acceptance-grade lifecycle coverage and complete root validation; no section above claims the feature has landed.
