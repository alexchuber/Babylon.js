# Implement accessible palette description tooltips

Status: resolved

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
- [x] The corrected touch-lifecycle implementation landed and root completed final validation and integration.

## Blocked by

None.

## Delivery status (resolved)

Feature PR #20 landed in `preview/nae` at merge commit `dea408ba`. Final integration evidence: palette units 13/13; targeted Chromium 1/1 with `retries=0`; full NAE Playwright 44/44 in one run with `retries=0`; NAE production build and changed-file Prettier, ESLint, and CRLF-aware diff checks clean; automatic instruction and agnostic reviews at Sol/Max clean. The browser proof covers the complete touch lifecycle plus mouse-hover, keyboard-focus, and palette-drop recovery.

## Comments

- 2026-07-21: Implemented compact label-only rows with trimmed shared Fluent description tooltips, visible-label accessible names, keyboard focus, and unchanged drag payloads/search metadata.
- 2026-07-21: Root review reopened the issue because Fluent also reacts to touch pointer entry, allowing a held contact to open the tooltip after the show delay.
- Earlier validation, rendered-check, and child-review claims do not cover the reopened final head and are not accepted as landing evidence.
- 2026-07-21: The corrected controlled-visibility path passed the complete final validation recorded above, including recovery of mouse hover, keyboard focus, and palette drop after touch.
- 2026-07-21: Automatic instruction and agnostic review lenses at Sol/Max were clean; PR #20 then landed at `dea408ba`, resolving the issue.
