# PRD — Palette description tooltips

Status: resolved

## Problem Statement

The Node Assets Editor palette renders every available node description as a permanent subheading below the node name. The extra copy makes the categorized list taller and harder to scan, especially when authors browse many Universal decisions, while still failing to give keyboard users an intentional way to request the same help. Authors need a compact name-first palette without losing descriptions, search terms, or accessible guidance.

## Solution

Render each palette item with its node name as the only always-visible item text. Preserve the existing optional description in the palette model and search projection, and expose each non-empty description through the repository's shared Fluent Tooltip primitive. The entire draggable row is the trigger: the tooltip appears with Fluent's existing default timing and placement on mouse or pen hover and keyboard focus, and contributes an accessible description while the visible node name remains the accessible name. A minimal controlled visibility path rejects touch-originated open requests so touch contact does not introduce long-press help. Items without meaningful descriptions remain ordinary draggable rows and never produce an empty tooltip.

## User Stories

1. As a graph author, I want palette rows to show node names without permanent descriptions, so that I can scan more nodes at once.
2. As a graph author, I want a node's explanation on mouse or pen hover, so that I can learn an unfamiliar node without spending palette space on every explanation.
3. As a keyboard user, I want the same explanation when I focus a palette row, so that the help is not pointer-only.
4. As a screen-reader user, I want the visible node name to remain the item's accessible name and the tooltip copy to be its accessible description, so that identity and help are announced distinctly.
5. As a graph author, I want descriptions to remain searchable, so that workflow-intent terms such as “decimate” still find the intended node.
6. As a graph author, I want family headings, category counts, and category expansion to stay unchanged, so that the palette remains familiar.
7. As a graph author, I want Show primitives to preserve its filtering and persistence behavior, so that tooltip presentation does not change discovery rules.
8. As a graph author, I want to drag any described node to the canvas exactly as before, so that requesting help does not interfere with authoring.
9. As a graph author, I want pointer clicks and taps on palette rows to retain their existing behavior, so that the tooltip does not add an accidental create action.
10. As a touch user, I want the palette to keep scrolling and dragging without a new touch-only overlay or gesture, so that the change does not regress touch interaction.
11. As a graph author, I want palette scrolling to remain smooth and contained within the pane, so that tooltip content does not participate in row layout.
12. As a graph author, I want long node names to keep the palette's existing wrapping behavior, so that removing descriptions does not truncate names.
13. As a graph author, I want long descriptions to use the established tooltip wrapping behavior, so that custom sizing does not create inconsistent UI.
14. As a graph author, I want items without descriptions to behave normally and show no blank popup, so that empty metadata is not exposed.
15. As a graph author, I want the tooltip to use the editor's active Fluent theme, so that help text matches the rest of the tool.
16. As a graph author, I want the tooltip to use established timing and placement defaults, so that it feels like other Babylon editor tooltips.
17. As a maintainer, I want tests to locate palette rows by stable palette semantics rather than native title attributes, so that replacing browser titles does not weaken drag coverage.
18. As a maintainer, I want browser coverage for hidden descriptions, hover, focus, search, and drag, so that future palette work preserves the compact accessible behavior.

## Acceptance Criteria

- [x] Each palette item shows its node name as the only always-visible item copy; descriptions are absent from row layout and are not rendered as visible subheadings.
- [x] The existing optional description metadata remains in palette items and remains part of `PaletteItemMatchesFilter`; category, family, Show primitives, and empty-search behavior are unchanged.
- [x] Every non-empty description is supplied to `shared-ui-components/fluent/primitives/tooltip`; no raw HTML `title` is used as a substitute or competing native tooltip.
- [x] The whole draggable palette row triggers the tooltip on mouse or pen hover and keyboard focus using the shared primitive's accessible description relationship.
- [x] The focusable trigger's visible node name remains its accessible name, and the tooltip text is exposed as its accessible description rather than replacing the name.
- [x] Missing, empty, or whitespace-only descriptions do not create an empty tooltip.
- [x] Tooltip delay, positioning, portal behavior, and text wrapping use the existing shared Fluent defaults; controlled visibility only suppresses touch-originated open requests.
- [x] Existing label wrapping/truncation behavior, row border/padding/minimum height, family spacing, and category density are preserved except for removal of the description line.
- [x] Tooltip plumbing does not change native drag payloads, canvas drops, clicking, pane scrolling, filtering, category toggling, or virtualization assumptions.
- [x] Holding touch contact beyond Fluent's show delay does not open a tooltip or add a touch long-press help gesture.
- [x] Automated browser coverage proves descriptions are absent before interaction, remain hidden during touch contact, appear as accessible tooltips on mouse hover and keyboard focus, remain searchable, and do not break an existing node drop.
- [x] Focused unit tests for palette search/projection, the targeted Node Assets Editor Playwright test, package build/type-check, and changed-file lint/format checks pass.
- [x] The rendered editor at the existing Node Assets Editor dev surface (default port 1348) is checked for compact rows, themed tooltip rendering, keyboard focus, and successful drag/drop.

## Implementation Decisions

- Keep the feature inside the reusable node-graph palette view; do not change block descriptors or duplicate description state.
- Reuse the shared Fluent Tooltip abstraction, which suppresses absent content, applies `relationship="description"`, and passes through Fluent's controlled visibility props; do not import raw Fluent Tooltip directly.
- Keep each draggable row as the tooltip child so Fluent augments the trigger without inserting a layout wrapper. Make the existing row keyboard-focusable and retain its drag handler and data attributes.
- Normalize tooltip content only enough to suppress whitespace-only descriptions. The source description and search metadata remain unchanged.
- Remove the native title attribute from palette rows. Browser tests and drag helpers should locate rows through the stable palette item test seam and exact visible label.
- Preserve Fluent theme tokens, current item padding/minimum height, and node-name typography. Do not add custom tooltip styles, timing, placement, or truncation; control visibility only to reject touch-originated opens.
- Update directly related model/catalog comments that still describe descriptions as visible beneath labels.
- Do not add click-to-create or keyboard-to-create behavior as part of making rows focusable; this feature only changes help presentation.

## Testing Decisions

- Use the real Node Assets Editor Playwright surface as the highest test seam. Adapt the existing workflow-intent/description test so one real palette item proves description-based search, no always-visible description, no tooltip after touch contact exceeds the show delay, mouse-hover and keyboard-focus tooltips, accessible name/description semantics, and an unchanged drag/drop action.
- Update the shared Playwright page helper so palette-item lookup no longer depends on the removed native title. Existing drop-heavy tests remain regression coverage for drag payloads and canvas creation.
- Keep the existing pure palette-category tests as the seam proving descriptions and keywords still participate in filtering and projection.
- Prefer role, accessible-description, visible-label, and palette test-id assertions over Fluent implementation selectors. Allow the established tooltip delay rather than overriding production timing for tests.
- No screenshot baseline is required: this is semantic/density behavior covered stably by DOM and accessibility assertions. Perform a rendered browser check for row density, tooltip placement/theme, focus, scrolling, and drag/drop.

## Out of Scope

- Editing node description copy, keywords, categories, families, or descriptor registration.
- Changing palette search, Show primitives, accordion behavior, pane sizing, scrolling, or adding virtualization.
- Adding click-to-create, Enter/Space-to-create, touch long-press help, pinned help, or custom tooltip preferences.
- Reworking palette rows into a new control type or changing any other Babylon editor palette.
- Custom tooltip timing, placement, width, animation, or styling.

## Further Notes

The implementation was based on the latest `preview/nae` and stayed surgical alongside concurrent graph-panning and import-node work.

## Delivery Status

Resolved. Feature PR #20 landed in `preview/nae` at merge commit `dea408ba`. Final integration evidence: palette units 13/13; targeted Chromium 1/1 with `retries=0`; full NAE Playwright 44/44 in one run with `retries=0`; NAE production build and changed-file Prettier, ESLint, and CRLF-aware diff checks clean; automatic instruction and agnostic reviews at Sol/Max clean. Browser coverage exercised the complete touch lifecycle and verified mouse hover, keyboard focus, and palette drop recovery afterward.
