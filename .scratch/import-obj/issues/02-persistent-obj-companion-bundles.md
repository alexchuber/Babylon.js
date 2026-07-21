# Support persistent OBJ companion bundles

Status: ready-for-agent
Blocked by: 01

## Parent

[Add Import OBJ to Node Assets Editor](../PRD.md)

## Feature request context

This is an authorized internal NodeAssets proof-of-concept workflow. The repository's public feature-request template requires a forum Discussion; that requirement does not apply here.

## What to build

Extend the end-to-end Import OBJ tracer from issue 01 to support local bundles containing exactly one `.obj` plus zero or more selected MTL and texture companions, while preserving URL companion behavior and Babylon's existing missing-MTL default.

Add the browser multi-file selection/picker path and validate that exactly one OBJ is selected. Persist every selected companion's bytes and supplied path alongside the primary OBJ so a saved graph can build offline. Preserve supplied relative paths, perform case-insensitive lookup, and provide an unambiguous basename fallback for normal browser multi-select output. Invalid selections must report a contextual source error and must not replace the current valid source.

Resolve URL MTL and texture references relative to the URL folder. For local builds, use a collision-safe, build-scoped virtual `file:` root integrated with the existing global FilesInputStore/object-URL lifecycle. Ensure companion resources are ready before GLB export, clean global entries and object URLs on both success and failure, and isolate concurrent imports even when bundles contain the same filenames.

Use synthetic original OBJ/MTL fixtures and a 1x1 texture to prove material names, colors, and selected texture embedding in the exported GLB. Preserve multiple `mtllib` last-reference behavior and the existing default that a missing MTL is a successful geometry-only import. Update the built-in fixture/pipeline and tests without modifying the Babylon loader, adding loader-options UI, or introducing icons, codegen, or an NAE MCP server. Implement tests first and cover browser File/multi-select behavior only at the necessary seam.

## User stories covered

1. As a local bundle user, I want to select one OBJ with optional MTL and texture companions, so that related files are authored as one source.
2. As a local bundle user, I want companion bytes and paths persisted, so that the bundle builds offline after JSON roundtrip.
3. As a local bundle user, I want relative paths preserved and case-insensitive lookup, so that ordinary OBJ/MTL references resolve.
4. As a local bundle user, I want unambiguous basename fallback for browser multi-select, so that common picker output works without unsafe guessing.
5. As a local bundle user, I want invalid selections rejected without replacing my current source, so that a bad selection does not destroy a good graph.
6. As a URL user, I want MTL and texture paths resolved relative to the OBJ URL folder, so that hosted bundles work without rewriting references.
7. As an OBJ author, I want material names, colors, and texture maps to survive, so that the exported GLB retains supported material information.
8. As a user with no MTL, I want geometry-only import to succeed, so that optional material files remain optional.
9. As a maintainer, I want build-scoped collision-safe file roots and cleanup, so that concurrent builds and repeated use do not overwrite or leak resources.
10. As a graph author, I want bundle JSON roundtrip and worker execution, so that persisted local sources behave like freshly selected sources.
11. As a pipeline-library user, I want an offline synthetic OBJ/MTL/texture example, so that companion support is demonstrable without network access.

## Acceptance criteria

- [ ] Local selection accepts exactly one `.obj` and zero or more MTL/texture companions; zero OBJ files, multiple OBJ files, unsupported or ambiguous selections fail contextually.
- [ ] An invalid local selection does not replace the current valid source or its persisted bytes.
- [ ] The browser multi-file helper/picker preserves the selected primary and companion paths and supports the intended File/multi-select behavior at its browser-level seam.
- [ ] Local JSON persistence includes the primary OBJ bytes/path and every selected companion's bytes/path; a roundtrip restores an offline-buildable source.
- [ ] Supplied relative paths are retained, companion matching is case-insensitive, and basename fallback is used only when the match is unambiguous.
- [ ] URL OBJ builds resolve MTL and texture references relative to the URL folder, while retaining the primary URL/source kind and existing stale-request, clear, and failed-source semantics.
- [ ] Local builds use a collision-safe, build-scoped virtual `file:` root; concurrent bundles with the same filenames cannot overwrite one another.
- [ ] FilesInputStore/global file entries and object URLs are removed after both successful and failed builds, including concurrent same-name bundles.
- [ ] Companion resources are ready before export, and an OBJ+MTL fixture with a 1x1 texture produces an inspectable GLB containing the expected material names/colors and an embedded texture.
- [ ] Multiple material changes retain Babylon's `_mmN` geometry split behavior, supported maps/colors survive, and multiple `mtllib` declarations retain Babylon's current last-reference behavior.
- [ ] A missing MTL remains a successful geometry-only import under the existing default behavior.
- [ ] The worker can build a persisted local bundle offline after JSON roundtrip.
- [ ] The built-in Import OBJ pipeline/library entry exercises an MTL and texture without network access.
- [ ] Focused runtime, editor, worker, persistence, lifecycle, and browser-level tests cover the above behavior and issue 01 remains green.
- [ ] No OBJ loader/parser changes, loader-options UI, credentials, ZIP/directory crawling, progress/abort API, icon, codegen, or NAE MCP work is introduced.

## Blocked by

01 — [Add the basic Import OBJ workflow end to end](01-basic-import-obj-workflow.md)
