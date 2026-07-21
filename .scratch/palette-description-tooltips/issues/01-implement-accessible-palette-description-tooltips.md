# Implement accessible palette description tooltips

Status: ready-for-agent

## Parent

[Palette description tooltips PRD](../PRD.md)

## What to build

Make the Node Assets Editor palette name-first and compact by removing always-visible node descriptions from palette rows while preserving description metadata and description-based search. Attach every meaningful description to the entire draggable row through the existing shared Fluent Tooltip abstraction. The row must expose the node name as its accessible name and the tooltip copy as its accessible description on pointer hover and keyboard focus, without changing drag/drop, click/touch, scrolling, filtering, category, family, or Show primitives behavior. Update the existing browser test seam and drag helper so the behavior is verified without relying on native title attributes.

## Acceptance criteria

- [ ] Descriptions no longer render as visible palette subheadings; node names remain visible with existing typography and wrapping.
- [ ] Non-empty descriptions use `shared-ui-components/fluent/primitives/tooltip`, open on pointer hover and keyboard focus, and are exposed through the tooltip's accessible description relationship.
- [ ] The focusable trigger keeps the node name as its accessible name; no native `title` tooltip competes with Fluent.
- [ ] Missing, empty, or whitespace-only descriptions create no tooltip.
- [ ] Tooltip defaults control timing, placement, wrapping, portal, and pointer behavior; no manual tooltip state or layout wrapper is added.
- [ ] Description metadata and description/keyword/category filtering remain unchanged.
- [ ] Drag payloads and canvas drops remain unchanged, and no click-to-create, keyboard-to-create, or touch gesture is introduced.
- [ ] Pane scrolling, category/family rendering, Show primitives, and item row density remain intact apart from removal of the description line.
- [ ] Tests are developed first and prove hidden descriptions, hover, focus, accessible semantics, search, and an unchanged palette-item drop through stable locators.
- [ ] Focused unit, Playwright, build/type-check, lint, and format validation passes, followed by a rendered check of the Node Assets Editor dev surface.
- [ ] `/code-review` reports no unresolved findings.

## Blocked by

None - can start immediately.

## Comments

No comments yet.
