# Implement accessible palette description tooltips

Status: ready-for-agent

## Parent

[Palette description tooltips PRD](../PRD.md)

## What to build

Make the Node Assets Editor palette name-first and compact by removing always-visible node descriptions from palette rows while preserving description metadata and description-based search. Attach every meaningful description to the entire draggable row through the existing shared Fluent Tooltip abstraction. The row must expose the node name as its accessible name and the tooltip copy as its accessible description on mouse or pen hover and keyboard focus, while rejecting touch-originated tooltip opens without changing drag/drop, click/touch, scrolling, filtering, category, family, or Show primitives behavior. Update the existing browser test seam and drag helper so the behavior is verified without relying on native title attributes.

## Acceptance criteria

- [x] Descriptions no longer render as visible palette subheadings; node names remain visible with existing typography and wrapping.
- [x] Non-empty descriptions use `shared-ui-components/fluent/primitives/tooltip`, open on mouse or pen hover and keyboard focus, and are exposed through the tooltip's accessible description relationship.
- [x] The focusable trigger keeps the node name as its accessible name; no native `title` tooltip competes with Fluent.
- [x] Missing, empty, or whitespace-only descriptions create no tooltip.
- [x] Tooltip defaults control timing, placement, wrapping, portal, and pointer behavior; controlled visibility only rejects touch-originated open requests and adds no layout wrapper.
- [x] Description metadata and description/keyword/category filtering remain unchanged.
- [x] Drag payloads and canvas drops remain unchanged, and no click-to-create or keyboard-to-create behavior is introduced.
- [x] Holding touch contact beyond Fluent's show delay does not open a tooltip or introduce touch long-press help.
- [x] Pane scrolling, category/family rendering, Show primitives, and item row density remain intact apart from removal of the description line.
- [x] Tests are developed first and prove hidden descriptions, touch suppression, mouse hover, focus, accessible semantics, search, and an unchanged palette-item drop through stable locators.
- [x] Focused unit, Playwright, build/type-check, lint, and format validation passes, followed by a rendered check of the Node Assets Editor dev surface.
- [x] `/code-review` reports no unresolved findings.

## Blocked by

None - can start immediately.

## Comments

- 2026-07-21: Implemented compact label-only rows with trimmed shared Fluent description tooltips, visible-label accessible names, keyboard focus, and unchanged drag payloads/search metadata.
- 2026-07-21: Root review reopened the issue because Fluent also reacts to touch pointer entry, allowing a held contact to open the tooltip after the show delay.
- Earlier validation, rendered-check, and child-review claims do not cover the reopened final head and are not accepted as landing evidence.
- The complete touch lifecycle regression and controlled Fluent visibility path passed the palette unit seam (13/13), targeted tooltip Playwright test (1/1), full NAE Playwright project (44/44), NAE production build, changed-file Prettier/ESLint, and diff checks under the exclusive local lease.
- Automatic agnostic and instructions review lenses at Sol/Max reported no significant issues; landing remains pending, so the issue stays unresolved.
