# PRD — Add Import OBJ to Node Assets Editor

Status: ready-for-agent

## Feature request template context

We only accept feature requests that are discussed on the BabylonJS forum.

**Is your feature request related to a problem? Please describe.**

NAE cannot import Wavefront OBJ, and OBJ's optional MTL and texture companions cannot currently be selected, persisted, or resolved as one authored source.

**Describe the solution you'd like**

Add a built-in `Read OBJ -> OBJ to Universal` Import OBJ aggregate with URL and local file-set sources, editor discovery and properties, graph persistence and worker execution, and a network-free built-in OBJ-to-glTF pipeline. The local workflow must support one OBJ plus optional MTL and texture companions while preserving Babylon loader behavior and safe source/build lifecycle semantics.

**Discussion**

N/A — authorized internal NodeAssets proof-of-concept workflow

## Problem Statement

The Node Assets Editor (NAE) currently has no OBJ source lane. Authors cannot make a typed OBJ source payload, select an OBJ with its optional MTL and texture companions, persist that authored source, or build the result offline through the existing Universal-to-glTF delivery path. Treating OBJ as Babylon or glTF would hide a distinct source format and would make companion resolution and error behavior ambiguous.

## Solution

Add a distinct shallow OBJ source representation and flat OBJ source connection-point kind. Provide a built-in **Import OBJ** aggregate composed of **Read OBJ** and **OBJ to Universal**, with one Universal output. Read OBJ supports URL activation and local selection of exactly one `.obj` plus zero or more companion files. URL sources resolve MTL and texture references relative to the URL folder; local sources persist primary and companion bytes/paths for offline builds. The source payload and build lifecycle preserve the existing Read-block last-successful, stale-request, clear, and failed-source semantics.

Use Babylon's existing OBJ loader through its registration wrapper and `LoadAssetContainerAsync`, then convert in a NullEngine scene to GLB with the existing exporter and WebIO before producing Universal. Do not modify the OBJ loader or add a separate parser. Preserve current Babylon behavior for object/group meshes, `_mmN` material splits, supported colors/maps, and last-reference behavior for multiple `mtllib` declarations. Missing MTL is a geometry-only success; other conversion and export failures surface as contextual errors.

Make Import OBJ default-visible in **Inputs / Aggregate imports**. Make Read OBJ and OBJ to Universal available under **Show primitives**. Forward child property sections and source controls to the aggregate. Wire the runtime, editor descriptors, connection-point/port style, exports, registry, palette, persistence, worker build, and offline built-in library entry without adding an icon, codegen path, or MCP server.

## User Stories

1. As a Node Assets Editor author, I want to discover Import OBJ in the default Inputs palette, so that OBJ is a first-class supported source without exposing implementation details.
2. As a graph author, I want Import OBJ to produce one Universal output, so that OBJ joins the existing source-to-Universal funnel.
3. As an advanced author, I want Read OBJ and OBJ to Universal to appear when Show primitives is enabled, so that I can inspect and compose the underlying typed path.
4. As a graph author, I want OBJ to remain a distinct source kind rather than masquerading as Babylon or glTF, so that wires and runtime payloads communicate the actual format.
5. As a user, I want to activate an OBJ URL, so that I can import a remote or served OBJ source using the same source-boundary workflow as sibling Read blocks.
6. As a URL user, I want the primary OBJ bytes and source kind persisted after activation, so that a saved graph can rebuild the authored source.
7. As a URL user, I want MTL and texture references resolved relative to the URL folder, so that ordinary OBJ companion paths work without manual rewriting.
8. As a local user, I want to select exactly one OBJ file, so that a standalone OBJ can be imported without requiring companions.
9. As a local bundle user, I want to select one OBJ plus optional MTL and texture files together, so that companion resources can be authored as one source.
10. As a local bundle user, I want selected primary and companion bytes and paths persisted, so that local OBJ imports remain buildable offline after reload.
11. As a local bundle user, I want supplied relative paths preserved, so that MTL references and texture paths retain the author's intended relationship.
12. As a local bundle user, I want case-insensitive companion lookup and an unambiguous basename fallback for normal browser multi-select, so that common file-picker output resolves without unsafe guessing.
13. As a local bundle user, I want invalid selections rejected without replacing the current valid source, so that an accidental selection cannot silently break my graph.
14. As a source-block user, I want the last successful source choice to become active, so that URL and local-source precedence is predictable.
15. As a source-block user, I want stale URL requests, clear actions, and failed activations to follow sibling Read-block semantics, so that asynchronous interaction cannot overwrite a newer source or erase a known-good source unexpectedly.
16. As a build user, I want the source to resolve through the registered Babylon OBJ loader, so that Import OBJ follows the supported loader behavior rather than a divergent parser.
17. As a build user, I want OBJ conversion to run through a NullEngine scene, the existing GLB exporter, WebIO, and Universal, so that the built-in pipeline is network-free and compatible with the current delivery lane.
18. As a graph author, I want the saved Import OBJ aggregate to execute in a worker, so that editor preview/build behavior matches persisted graph execution.
19. As a graph author, I want child source properties automatically forwarded to Import OBJ, so that I can configure a compact aggregate without expanding it.
20. As a graph author, I want a contextual diagnostic when conversion or export fails, so that the failing source or stage is understandable.
21. As an OBJ author, I want one mesh per OBJ object or group, so that named source structure is preserved.
22. As an OBJ author, I want material changes to retain Babylon's `_mmN` split behavior, so that geometry boundaries remain compatible with existing OBJ imports.
23. As an OBJ author, I want supported material colors and maps to survive conversion, so that the output remains visually faithful within the existing loader behavior.
24. As an OBJ author, I want multiple `mtllib` declarations to retain Babylon's current last-reference behavior, so that this feature does not introduce a new interpretation of existing files.
25. As a user with no MTL, I want geometry-only import to succeed, so that missing optional material files are not treated as fatal.
26. As a user, I want loader defaults to remain the current Babylon defaults, so that Import OBJ is predictable and does not introduce an options UI.
27. As a maintainer, I want the OBJ source representation and flat connection kind to be shallow and explicit, so that future source companions do not leak into unrelated format lanes.
28. As a maintainer, I want the file-store root to be collision-safe and build-scoped, so that concurrent imports with the same filenames cannot overwrite one another.
29. As a maintainer, I want global file-store entries and object URLs cleaned up after both success and failure, so that repeated builds do not leak resources.
30. As a pipeline-library user, I want a built-in Import OBJ workflow with synthetic original OBJ/MTL fixtures, so that the feature can be demonstrated and tested without network access.
31. As a graph author, I want the Import OBJ graph to round-trip through JSON, so that source data, aggregate structure, and configuration survive save/load.
32. As a maintainer, I want existing glTF, USD, Babylon, and Node Geometry imports unchanged, so that adding OBJ does not broaden or destabilize unrelated source workflows.
33. As a maintainer, I do not want icons, code generation, or an NAE MCP server added for this proof of concept, so that the feature stays within the approved product surface.

## Implementation Decisions

- Add a distinct shallow OBJ source representation and flat OBJ source connection-point kind. OBJ is not represented as Babylon, glTF, or Universal until the explicit OBJ-to-Universal transcoder runs.
- Model Import OBJ as a real aggregate: `Read OBJ -> OBJ to Universal`, exposing one Universal output. Read OBJ remains a hidden primitive by default and is revealed by Show primitives.
- Add Import OBJ to the default Inputs / Aggregate imports palette. Add Read OBJ and OBJ to Universal to Show primitives. Use the existing NAE descriptor model; it has no icon field, so no icon work is needed.
- Preserve the sibling Read-block source state machine: URL activation fetches primary OBJ bytes and stores URL/source kind; stale requests cannot replace newer successful state; clear and failed-source behavior match existing semantics; invalid local selections do not replace the current source.
- URL builds resolve MTL and texture references relative to the URL folder. Local activation accepts exactly one `.obj` plus zero or more selected companions, persists primary and companion bytes/paths, preserves supplied relative paths, uses case-insensitive lookup, and permits only an unambiguous basename fallback for normal browser multi-select.
- Use a collision-safe, build-scoped virtual `file:` root for local companions. Integrate the existing global FilesInputStore/object-URL lifecycle, and clean entries and URLs after success and failure. Concurrent imports must not overwrite one another.
- Reuse Babylon's existing OBJ loader through its registration wrapper and `LoadAssetContainerAsync`; do not change the loader or create a second parser. Build with a NullEngine scene, export GLB through the existing exporter and WebIO, and convert to Universal.
- Preserve loader behavior: one mesh per object/group; `_mmN` splits for material changes; supported colors/maps; and current last-reference behavior for multiple `mtllib` declarations.
- Expose no loader-options UI. Keep defaults: optimizeWithUV true, UVScaling (1,1), invertY false, invertTextureY true, importVertexColors false, computeNormals false, optimizeNormals false, skipMaterials false, materialLoadingFailsSilently true, and useLegacyBehavior false.
- Missing MTL is a successful geometry-only import. Other conversion/export failures must surface contextually rather than becoming silent success.
- Forward aggregate child property sections and source controls automatically, so compact and expanded views use the same authored values.
- Wire runtime exports and registration, editor descriptors and port styling, default palette/library discovery, JSON persistence, and worker build execution. Saved graphs execute in a worker through package-barrel self-registration.
- Add a network-free built-in Import OBJ library graph and synthetic original OBJ/MTL/texture fixtures. Do not add codegen, icons, an NAE MCP server, or loader/parser changes.

## Acceptance Criteria

- [ ] Import OBJ preserves Babylon's default `materialLoadingFailsSilently: true`; when a parsable OBJ references an unavailable MTL, the build succeeds as a geometry-only asset.
- [ ] The unavailable-MTL regression uses existing loader/node diagnostics only and does not add a new warning channel; actual conversion and export failures remain contextual errors.

## Testing Decisions

- Test external behavior at the highest existing seam: NodeAsset.buildAsync with JSON roundtrip and GLB inspection should prove typed source activation, aggregate execution, conversion, mesh/material/texture preservation, and output structure together.
- Use synthetic original OBJ, MTL, and 1x1 texture fixtures so the core and worker tests do not depend on network access. Include multiple named objects/groups, material splits, names/colors, selected texture embedding, and a missing-MTL geometry-only case.
- Add a focused regression with a parsable OBJ that references an unavailable MTL. Assert `materialLoadingFailsSilently: true` remains the default, the build succeeds with geometry only, no new warning channel is emitted, and existing loader/node diagnostics remain the only diagnostic surface.
- Test the source lifecycle at the Read OBJ/editor seam: URL success, stale request suppression, clear, failed-source retention, invalid local selection retention, malformed persistence rejection, relative-path resolution, case-insensitive lookup, unambiguous basename fallback, and concurrent build-scoped file roots.
- Test global FilesInputStore and object-URL cleanup after both success and failure, including concurrent same-name bundles.
- Test editor controller and worker behavior for descriptor/registry/palette/property/library counts, default-visible versus Show primitives discovery, typed ports, forwarded source properties, execution, and JSON roundtrip.
- Use browser-level coverage only where needed for File and multi-select picker behavior; avoid duplicating runtime tests in the browser.
- Follow existing NodeAssets import, aggregate, worker, editor controller, and pipeline-library tests as prior art. No visualization test is required because the feature is an asset import/build workflow rather than a rendering change.
- Assert user-visible behavior and public contracts, not private parser or loader implementation details. Existing glTF, USD, Babylon, and Node Geometry import tests must remain green.

## Out of Scope

- Editing or exporting OBJ.
- Changes to the Babylon OBJ loader or a new OBJ parser.
- Merging multiple MTL files, unsupported MTL features, smoothing/illumination work, or a new material semantics layer.
- Loader-options UI, credentials, ZIP handling, directory crawling, new progress/abort APIs, or alternate companion-selection workflows.
- Icons, code generation, and an NAE MCP server.
- Changes to existing glTF, USD, Babylon, or Node Geometry import behavior except for required shared registration wiring.

## Further Notes

Import OBJ is approved as an internal NodeAssets proof-of-concept workflow. Acceptance requires it to be default-visible and usable; primitives must be typed and discoverable under Show primitives; URL root resolution must work; local OBJ+MTL+texture bundles must persist and build offline; multiple meshes, materials, names, and selected textures must survive into the exported GLB; missing MTL must succeed geometry-only; source errors, races, clear behavior, cleanup, registration, worker execution, and roundtrip must be correct; the built-in pipeline must run offline; focused tests must pass; and no MCP, icon, or codegen changes may be introduced.
