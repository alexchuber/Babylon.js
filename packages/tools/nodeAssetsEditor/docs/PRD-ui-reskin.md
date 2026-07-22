## Summary

Redo the Node Assets Editor (NAE, `packages/tools/nodeAssetsEditor`) UI/UX so it looks and feels consistent with Babylon's other Node Editors (NME, NGE, NRGE, NPE), while preserving all current NAE runtime behavior. Aggregate blocks must be represented as expandable, titled regions in the style of NME's custom frames (`GraphFrame`) — explicitly **not** like the Smart Filters Editor's flat, opaque aggregate presentation.

This issue is the feature PRD for integration branch `preview/nae`. Implementation will be decomposed into separate tracked issues (see "Decomposition" below), each landing as its own PR against `preview/nae`.

## Background / current-state research

NAE is **not** "Node Animation Editor" — per `packages/tools/nodeAssetsEditor/CONTEXT.md` it is the **Node Assets Editor**: a visual authoring tool for NodeAssets graphs (glTF/USD/OBJ/FBX/Babylon/Node Geometry import → optimize → export GLB pipelines).

Architecturally, NAE is the **most Fluent-native, most modern** editor of the five:
- 100% Fluent UI v9 (`makeStyles`/`tokens`), zero SCSS/CSS files.
- Built on the shared `MakeModularTool` shell (`@dev/shared-ui-components`) with a compact toolbar and theme selector.
- A bespoke, from-scratch, React + inline-SVG canvas framework (`src/nodeGraph/*`) — pan/zoom, hit-testing, gesture FSM, layout, undo/redo, all hand-rolled and explicitly designed to be host-agnostic/"promotable."
- Property panels already use the shared Fluent property-line HOCs (`TextInputPropertyLine`, `StringDropdownPropertyLine`, `SyncedSliderPropertyLine`, `SwitchPropertyLine`, `Vector3PropertyLine`, `ButtonLine`) from `@dev/shared-ui-components/fluent`.
- Palette already uses Fluent `Accordion`/`Checkbox`/`Tooltip` with HTML5 native drag-and-drop.

By contrast, **NME, NGE, NRGE, and NPE all share the legacy, imperative, DOM-class-based graph system** (`packages/dev/sharedUiComponents/src/nodeGraphSystem`: `GraphCanvasComponent`, `GraphNode`, `GraphFrame`, `NodePort`, `NodeLink`), with legacy `LineContainerComponent`/`DraggableLineComponent`-based palettes and property tabs. None of them enable the Fluent theming path (`FluentToolWrapper`'s `?newUX=true` gate is unused in all four). Fluent adoption in `sharedUiComponents/src/fluent/` is explicitly an in-progress migration target for those editors, not something NAE should regress away from.

**Decision (locked for this PRD):** We will **not** replace NAE's canvas engine with the legacy shared `nodeGraphSystem` — doing so would be a technical regression (dropping Fluent theming for legacy CSS) and contradicts the intent of "modernizing" the UI. Instead, this PRD aligns NAE's **conventions, interactions, and visual language** with its siblings — especially the aggregate/custom-frame interaction model — while keeping NAE's existing Fluent-native architecture as the foundation.

NAE's current aggregate model already tracks NME's frame semantics reasonably well:
- **Aggregate node** (collapsed) ≈ NME's collapsed `GraphFrame` (single node showing only boundary/public ports).
- **Expanded aggregate** (`IGraphFrame` with `kind: "aggregate"`) ≈ NME's expanded `GraphFrame` (titled region containing member nodes/wires).

But there are concrete gaps vs. NME's `GraphFrame` and general sibling-editor conventions (full list from research, used to scope issues below):
1. No canvas background grid (NME/NGE/etc. and most node editors show a dot/line grid; NAE's canvas is a flat color).
2. Node header and port dot colors are hardcoded hex strings (`blockCatalog.ts`), not design tokens — they do not adapt across light/dark theme.
3. Color properties render as a plain text field with a `#rrggbb` validator — no Fluent `ColorPicker`/swatch (one already exists in `sharedUiComponents/fluent/primitives/colorPicker.tsx`, currently unused by NAE).
4. **No UI to create user layout frames at all.** `IGraphFrame`, serialization, and rendering exist, but there's no gesture/button/context-menu action to group selected nodes into a frame — the only frames ever created are aggregate-projection frames. NME supports authoring arbitrary layout frames.
5. Aggregate/user frames lack NME `GraphFrame` parity features: draggable resize handles on all edges/corners, editable comments row, full title/color editing via UI (not just data model).
6. Minimap is always visible regardless of graph size/no toggle, unlike opt-in patterns elsewhere.
7. No context-menu actions for canvas/node/wire beyond the current minimal set (no "Add frame," "Frame selection," "Disconnect all ports").
8. Ports are differentiated by color only — no shape coding for port/type family, unlike some sibling conventions.
9. No drag-to-reconnect existing wire gesture (delete + recreate only).
10. No wire crossing avoidance/orthogonal routing option.
11. No aggregate "collapsed contents" indicator/badge (how many primitives are hidden inside).
12. No in-app keyboard shortcut help/cheat sheet.
13. `PropertiesView`'s "No selection" state is a bare italic text line, not a proper empty-state pattern.
14. Saved library entries can be loaded but not renamed or deleted from the Library dialog UI.

## Goals

- G1: Visually and interactionally align NAE's canvas, palette, and properties surfaces with established Babylon Node Editor conventions (grid background, token-based coloring, Fluent color picker, frame authoring/resize/comments, minimap conventions, context-menu parity, keyboard shortcut discoverability).
- G2: Aggregate blocks are represented and interacted with using the NME custom-frame model: collapsed = compact node exposing only public ports; expanded = titled, resizable, colorable, commentable frame containing primitive nodes and internal wires, with boundary-port behavior equivalent to NME's `FrameNodePort` proxies.
- G3: Users can author arbitrary layout frames (group selected nodes, name/color/resize them) — closing the current parity gap with NME.
- G4: Preserve 100% of current NAE runtime/build/export/validation/library behavior; this is a UI/UX-layer change only.
- G5: Keep NAE's existing Fluent v9 / `MakeModularTool` architecture; do not introduce the legacy `nodeGraphSystem`, SCSS, or non-Fluent components.
- G6: Maintain and extend automated coverage (Vitest unit + Playwright e2e) so regressions are caught before merge.

## Non-goals

- NG1: Do not port NAE's canvas engine to the shared `nodeGraphSystem`, and do not port NME/NGE/NRGE/NPE onto NAE's canvas engine (out of scope; each editor's canvas remains as-is besides NAE's own convention updates).
- NG2: Do not change NodeAssets runtime/build semantics, block registry, `@dev/node-assets` package, or GLB export/validation logic.
- NG3: Do not change the aggregate/primitive/palette *data model* (`IBlockDescriptor`, `abstractedBy`, categories) beyond what's needed to support new interactions (e.g., frame creation) — this is a UI reskin, not a data-model redesign.
- NG4: Do not adopt the Smart Filters Editor's flat/opaque aggregate presentation (single node, no inline expansion) — explicitly rejected pattern.
- NG5: Do not remove or degrade any existing Playwright-covered behavior (see `test/playwright/nodeAssetsEditor.test.ts`).

## UX parity targets (by surface)

### Canvas
- Add a subtle dot/line background grid consistent with sibling editors' visual language, using Fluent tokens (theme-aware).
- Replace hardcoded hex header/port colors in `blockCatalog.ts` with a token-driven palette (still visually distinct per family, but theme-adaptive light/dark).
- Add context-menu actions: "Add frame" (canvas, from marquee/multi-selection), "Rename frame," "Disconnect all" (port), consistent with common node-editor conventions.
- Add drag-to-reconnect gesture for existing wires (grab an endpoint and re-drop).
- Add a minimap visibility toggle (or size-based auto-hide) instead of always-on.
- Add an in-app keyboard shortcuts reference (e.g., `?` overlay or toolbar help button).

### Frames (user layout + aggregate)
- Implement "group selected nodes into a frame" (context menu and/or keyboard shortcut) — closes G3.
- Bring frame visuals/interactions to NME `GraphFrame` parity: resize via edge/corner handles, editable title, editable color (swatch picker), optional comments row.
- Aggregate-expanded frames keep their current "Collapse aggregate" affordance, but adopt the same visual chrome (header style, resize where applicable, color) as user frames, differentiated only by the aggregate-specific collapse action and non-deletability of member nodes independent of the aggregate.
- Add a collapsed-aggregate badge indicating hidden primitive count.

### Palette
- Keep Fluent `Accordion` structure; align category/family visual hierarchy and search behavior with sibling editors' palette conventions (spacing, icons, tooltips) — no functional changes to "Show primitives," hidden-primitive rules, or category logic.

### Properties pane
- Replace the `TextInputPropertyLine` + regex color editing with the existing Fluent `ColorPicker` primitive (swatch + popover), wired through the same `IColorPropertyDescriptor` contract.
- Replace the bare "No selection" text with a proper empty-state pattern (icon + message), Fluent-styled.
- No change to GENERAL/BUILD ERROR section ordering or forwarded-property mechanism.

### Library
- Add rename/delete actions for user-saved library entries in the Library dialog.

## Aggregate / custom-frame behavior (acceptance detail)

- Collapsing an expanded aggregate must tear down its projected child nodes/wires/frame in one atomic, undo-able step (existing behavior — must not regress).
- Expanding an aggregate must restore previously-expanded nested aggregates recursively via `_authoredAggregateExpansion` (existing behavior — must not regress).
- Visual chrome for an expanded aggregate frame (header color, title, chevron, resize handles, comments) must be indistinguishable in interaction model from a user-authored frame, except for: the "Collapse aggregate" action, and that aggregate frames cannot be deleted independently of collapsing the aggregate.
- Diagnostics re-projection (`_reprojectBuildDiagnostics`) must continue to work when frame visuals change.

## Compatibility

- No changes to saved graph JSON schema beyond additive fields needed for new frame-authoring metadata (must remain backward-loadable; old saves without new fields get sensible defaults).
- No changes to `@dev/node-assets` public API.
- No changes to library `localStorage` schema version unless additive (bump `schemaVersion` only if a breaking shape change is unavoidable, with migration).

## Testing

- Extend `test/unit/` (Vitest) coverage for: frame creation/grouping logic, token-based color mapping, color picker property binding.
- Extend `test/playwright/nodeAssetsEditor.test.ts` (or a new spec file) for: creating a user frame from selection, resizing/coloring/renaming a frame, drag-to-reconnect a wire, disconnect-all context action, minimap toggle, keyboard-shortcut overlay, library rename/delete.
- Full existing Playwright suite (`--project=nodeAssetsEditor`) must remain green — zero regressions in pipeline/build/preview/validation/aggregate expand-collapse/import/export flows.
- Visual verification: render key states (default palette, expanded aggregate, collapsed aggregate, user frame, color picker open) and confirm against sibling-editor look-and-feel intent before merging the feature PR.

## Rollout

- All work lands on feature branches → PRs targeting `preview/nae` (never directly to `preview/nae`).
- Land in dependency order: (1) canvas visual foundations (grid, token colors) → (2) frame authoring + aggregate frame parity → (3) properties pane (color picker, empty state) → (4) palette polish → (5) library management → (6) context-menu/shortcuts/minimap polish → (7) feature-level validation and final integration PR from `preview/nae` into its eventual target.
- Each child issue's PR must pass targeted unit + e2e validation before integration into `preview/nae`.

## Risks

- R1: Frame-authoring UI (new) has no prior NAE implementation to extend — highest-effort, highest-risk item; sequence it early so remaining issues can build on its primitives.
- R2: Token-driven header/port recoloring touches `blockCatalog.ts`, which is read by both palette and canvas rendering — must verify no visual regressions across all ~20+ block types.
- R3: Aggregate-frame/user-frame visual unification must not weaken the existing "aggregate frames aren't independently deletable" invariant — needs explicit test coverage.
- R4: Because NAE's canvas is hand-rolled (not the shared system), sibling-editor "conventions" must be reinterpreted/re-implemented natively in `src/nodeGraph/*` rather than imported — every issue must budget for this (no shortcut of "just import the shared component").

## Decomposition

This PRD will be broken into small, dependency-aware GitHub issues (tracked separately, linked back to this issue), each scoped to land as one reviewable PR against `preview/nae`.
