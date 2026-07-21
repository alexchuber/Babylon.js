# Implement accessible palette description tooltips

Status: resolved

## Parent

[Palette description tooltips PRD](../PRD.md)

## What to build

Make the Node Assets Editor palette name-first and compact by removing always-visible node descriptions from palette rows while preserving description metadata and description-based search. Attach every meaningful description to the entire draggable row through the existing shared Fluent Tooltip abstraction. The row must expose the node name as its accessible name and the tooltip copy as its accessible description on pointer hover and keyboard focus, without changing drag/drop, click/touch, scrolling, filtering, category, family, or Show primitives behavior. Update the existing browser test seam and drag helper so the behavior is verified without relying on native title attributes.

## Acceptance criteria

- [x] Descriptions no longer render as visible palette subheadings; node names remain visible with existing typography and wrapping.
- [x] Non-empty descriptions use `shared-ui-components/fluent/primitives/tooltip`, open on pointer hover and keyboard focus, and are exposed through the tooltip's accessible description relationship.
- [x] The focusable trigger keeps the node name as its accessible name; no native `title` tooltip competes with Fluent.
- [x] Missing, empty, or whitespace-only descriptions create no tooltip.
- [x] Tooltip defaults control timing, placement, wrapping, portal, and pointer behavior; no manual tooltip state or layout wrapper is added.
- [x] Description metadata and description/keyword/category filtering remain unchanged.
- [x] Drag payloads and canvas drops remain unchanged, and no click-to-create, keyboard-to-create, or touch gesture is introduced.
- [x] Pane scrolling, category/family rendering, Show primitives, and item row density remain intact apart from removal of the description line.
- [x] Tests are developed first and prove hidden descriptions, hover, focus, accessible semantics, search, and an unchanged palette-item drop through stable locators.
- [x] Focused unit, Playwright, build/type-check, lint, and format validation passes, followed by a rendered check of the Node Assets Editor dev surface.
- [x] `/code-review` reports no unresolved findings.

## Blocked by

None - can start immediately.

## Comments

- 2026-07-21: Implemented compact label-only rows with trimmed shared Fluent description tooltips, visible-label accessible names, keyboard focus, and unchanged drag payloads/search metadata.
- Validation: palette unit tests 13/13; focused package Playwright 1/1; full NAE Playwright project 39/39; NAE build, changed-file ESLint, Prettier, and diff checks passed.
- Rendered validation: rows remained 34 px high; hover and focus showed the themed 240 px-default tooltip; the palette scrolled 500 px inside its pane; click kept 4 nodes and the existing drop path created a fifth node.
- Two-axis `/code-review`: standards and spec both reported no unresolved findings.
