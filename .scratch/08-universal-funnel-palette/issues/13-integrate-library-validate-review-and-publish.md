# Integrate the Universal funnel, migrate the library, and publish the preview

Status: ready-for-agent

## What to build

Integrate every completed slice into one coherent NodeAssets runtime and Node Assets Editor product. Resolve shared registry, barrel, descriptor, controller, serialization, and test conflicts without reintroducing old palette vocabulary.

Replace the built-in pipeline library with buildable examples for:

1. glTF optimization and aggregate export;
2. USD to optimized glTF;
3. Babylon to optimized glTF;
4. Node Geometry to glTF;
5. multi-source Universal merge;
6. advanced glTF compression using `Universal → glTF`, **Compress Textures (KTX2)**, **Compress Geometry (Draco)**, and **Write glTF**;
7. a representative full Universal optimization pipeline.

Remove obsolete custom-texture, material-decomposition, selector, value, and image examples. Replace the energy-orb default with a maintained library-quality graph that exercises real preview and GLB download under the new vocabulary. Preserve the latest preview baseline's operand grouping, **Inputs** rename, material-block removal, preview restoration, graph editing, diagnostics, validation, and library UX fixes.

Reconcile domain documentation and intentional saved-graph migration behavior. Then run targeted and full verification, invoke the `code-review` skill, and complete the required `improve-codebase-architecture` gate. Only after every gate passes, publish through the existing `preview/nae` GitHub Pages flow and verify the deployed `/nae/` application.

## User stories covered

55-64 and final integration of stories 1-54.

## Acceptance criteria

- [ ] All slice branches/commits are integrated, conflicts are resolved semantically, and the runtime/editor expose one aggregate model and one exact palette vocabulary.
- [ ] The built-in library contains exactly the seven required current examples, derives its UI list and executable graphs from one production catalog, and contains no obsolete examples.
- [ ] Every built-in entry loads, builds, previews successfully, and can produce a non-empty valid GLB; tests enumerate the production catalog rather than a duplicate list.
- [ ] The maintained default graph auto-previews and downloads successfully and remains library quality rather than a test-only fixture.
- [ ] Playwright exercises one source from each supported format through Universal optimization to GLB, plus the advanced glTF-native codec path and multi-source merge.
- [ ] Runtime coverage proves all Import aggregates against expanded graphs, every Universal operator in representative chains, Export glTF against its primitive graph, aggregate/custom-aggregate round-trip, strict port kinds, Node Geometry evaluation, and semantic deduplication.
- [ ] Targeted NodeAssets runtime tests, Node Assets Editor unit tests, Node Assets Editor Playwright tests, and deployment build pass.
- [ ] Repository-wide `npm run format:check`, `npm run lint:check`, and `npm run test:unit` pass after targeted checks; failures caused by this feature are fixed rather than waived.
- [ ] A fresh-context verifier who did not implement the integration independently checks the PRD's observable runtime and editor seams and records evidence for the final acceptance matrix.
- [ ] The `code-review` skill reviews the complete integrated branch against both repository instructions and an agnostic bug lens; all high-confidence findings caused by this work are resolved and the review is rerun clean.
- [ ] After implementation and tests pass, `improve-codebase-architecture` runs over the changed NodeAssets runtime and Node Assets Editor modules, writes its HTML report outside the repository, identifies the top recommendation, and records the result.
- [ ] Architectural defects directly caused by this work are fixed before completion; unrelated recommendations are reported without silently expanding scope.
- [ ] Current domain docs describe Universal, aggregates, exact palette visibility, and migration behavior; older milestone language is not allowed to override PRD 08.
- [ ] The GitHub Pages workflow is not triggered until every prior check, independent verification, code review, and architecture gate succeeds.
- [ ] After verification, the approved integration is published through `preview/nae`; the workflow succeeds and the deployed `/nae/` app is manually smoke-tested for default preview, palette, library load, and GLB download.

## Blocked by

- 01 — Establish the aggregate-backed glTF Universal funnel.
- 02 — Add the USD to Universal import funnel.
- 03 — Add the Babylon to Universal import funnel.
- 04 — Add the Node Geometry to Universal import funnel.
- 05 — Add Deduplicate Resources and its semantic primitives.
- 06 — Deliver the Universal cleanup operators.
- 07 — Deliver the Universal reduction operators.
- 08 — Deliver the Universal hierarchy and assembly operators.
- 09 — Deliver the Universal scene transform and texture resize operators.
- 10 — Deliver the Universal attribute operators.
- 11 — Align the explicit glTF delivery codecs.
- 12 — Publish the exact palette and Show primitives preference.
