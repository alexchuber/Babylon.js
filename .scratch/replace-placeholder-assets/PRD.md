# PRD — Replace placeholder assets with official CDN assets

Status: ready-for-agent

## Problem Statement

The Node Assets Editor pipeline library is executable product UI, but its maintained built-in
pipelines currently demonstrate supported source-to-GLB workflows with tiny generated placeholders
rather than representative Babylon assets. Five generated source payloads are embedded into the
catalog serializations and shared across seven user-facing built-in pipelines:

| Generated payload | Current serialized source | Built-in pipeline roles |
| --- | --- | --- |
| Indexed generated triangle GLB | `catalog-triangle.glb` | Default **glTF Optimization**; glTF arm of **Multi-Source Universal Merge**; **Advanced glTF Compression** |
| Unwelded generated triangle GLB | `catalog-triangle.glb` | **Full Universal Optimization** |
| Generated Babylon triangle | `catalog-triangle.babylon` | **Babylon to Optimized glTF**; Babylon arm of **Multi-Source Universal Merge** |
| Inline USDA triangle | `catalog-triangle.usda` | **USD to Optimized glTF** |
| Inline Node Geometry Box serialization | `catalog-box.json` | **Node Geometry to glTF** |

The generated glTF and Babylon payloads make the library look unfinished and leave advanced
pipelines operating on content too small or too simple to demonstrate their purpose. Embedding the
same source bytes into multiple serialized graphs also increases the editor bundle without improving
the user experience.

Replacing those payloads with URL strings alone is not sufficient. A built-in graph must resolve its
remote Read-block sources before its build is serialized to the worker. Startup must wait for the
active default graph, but the editor must not prefetch every library entry. Later library selection
must hydrate only the newly active graph. Resolved bytes must apply only while the active graph still
owns the Read block, and active failures must surface through the existing preview/build error
experience without dispatching an incomplete worker build.

The official BabylonJS/Assets repository does not contain USD-family files or serialized Node
Geometry graphs. Substituting unrelated formats for those two inputs would misrepresent the
importers. Those inline payloads are therefore intentional importer conformance samples, not
replaceable product placeholders.

## Solution

Replace each generated glTF and Babylon catalog role with an exact, self-contained asset hosted by
the official Babylon assets CDN. Built-in serializations carry the exact CDN URL with
`sourceKind: "url"` and no copied binary or base64 payload for each replaced Read block.

Use the existing Read glTF and Read Babylon URL APIs behind one high-level, injectable source
hydration seam at the `NodeAssetGraphController` / `BuildOrchestrator` boundary:

1. On startup, hydrate only the active default graph before its first build.
2. Before any later active graph is serialized for a worker build, hydrate only its URL-configured
   Read blocks.
3. Apply resolved bytes only while the requesting graph revision still owns the Read block.
4. Refresh the controller's build-relevant signature after hydration without publishing an authored
   graph change.
5. Throw active hydration failures through the existing startup or build path so the existing
   preview status, build error, and node diagnostic UX remains authoritative. After a startup
   failure, subscribe for later authored changes without starting an immediate build.

Do not prefetch library entries, copy official binaries into Babylon.js, introduce URL support for
formats that do not have a valid official asset, or change any pipeline identity or ordering.

Retain the USDA triangle and Node Geometry Box serialization in production as explicitly named
importer conformance samples. Their inline bytes remain deterministic and network-independent.

## Approved Asset Mapping

The CDN URL construction rule is exact:

`https://assets.babylonjs.com/` + the exact case-sensitive BabylonJS/Assets repository-relative path.

No path normalization, case changes, alternate hostnames, redirects, or inferred filenames are
allowed.

| Semantic role | Affected built-in pipelines | Disposition | Exact Assets path | Exact CDN URL | Expected bytes | Required asset facts |
| --- | --- | --- | --- | --- | ---: | --- |
| Default indexed glTF source | **glTF Optimization** | Replace | `meshes/roundedCube.glb` | `https://assets.babylonjs.com/meshes/roundedCube.glb` | 13,624 | Self-contained indexed GLB with `POSITION`, `NORMAL`, `TANGENT`, and `TEXCOORD_0` |
| Multi-source glTF arm | **Multi-Source Universal Merge** | Replace with the same default-role asset | `meshes/roundedCube.glb` | `https://assets.babylonjs.com/meshes/roundedCube.glb` | 13,624 | Same self-contained indexed rounded cube |
| Compression-focused indexed glTF source | **Advanced glTF Compression** | Replace | `meshes/graveYardPack/fenceAPillar1/fenceAPillar1.glb` | `https://assets.babylonjs.com/meshes/graveYardPack/fenceAPillar1/fenceAPillar1.glb` | 115,728 | Self-contained indexed GLB with UVs and one embedded image, making KTX2 and Draco meaningful |
| Full-graph glTF source | **Full Universal Optimization** | Replace | `meshes/module_600.glb` | `https://assets.babylonjs.com/meshes/module_600.glb` | 10,996 | Self-contained GLB with six meshes, twelve nodes, two materials, normals, UVs, and no companion files; geometry is already indexed, so Weld Vertices may be a no-op |
| Babylon optimization source | **Babylon to Optimized glTF** | Replace | `meshes/babylonJS_logo_v3.babylon` | `https://assets.babylonjs.com/meshes/babylonJS_logo_v3.babylon` | 7,658 | Two meshes, one material, and no external textures |
| Multi-source Babylon arm | **Multi-Source Universal Merge** | Replace with the same Babylon-role asset | `meshes/babylonJS_logo_v3.babylon` | `https://assets.babylonjs.com/meshes/babylonJS_logo_v3.babylon` | 7,658 | Same self-contained Babylon logo |
| USD importer conformance source | **USD to Optimized glTF** | Retain inline | N/A | N/A | Inline | Existing complete USDA triangle; the official Assets tree has zero `.usd`, `.usda`, `.usdc`, or `.usdz` files |
| Node Geometry importer conformance source | **Node Geometry to glTF** | Retain inline | N/A | N/A | Inline | Existing serialized Node Geometry Box graph; the official Assets tree and content search contain no serialized Node Geometry asset |

## Retention and Exclusion Inventory

| Inventory item | Classification | Decision |
| --- | --- | --- |
| Four generated glTF/Babylon source payload roles | Production placeholders | Replace according to the approved mapping |
| Inline USDA triangle | Intentional importer conformance sample | Retain inline and identify it as intentional; do not invent an official URL |
| Inline Node Geometry Box graph | Intentional importer conformance sample | Retain inline and identify it as intentional; do not add URL support for an invalid substitute |
| Pipeline library controls without thumbnails | Current product UI | Not a placeholder asset; unchanged |
| Preview empty state and preview error state | Intentional UI fallback | Unchanged |
| Properties and Search placeholder text | Intentional input affordance | Unchanged |
| Test fixtures and snapshots | Test-only support | Excluded unless an assertion directly covers the changed catalog behavior |
| Documentation examples | Documentation | Excluded from production-placeholder replacement |
| Generated catalog previews | Derived/test output | Excluded; do not treat as source assets |
| Historical local tracker text | Project history | Excluded |
| Unrelated legacy tools | Separate products | Excluded |
| OBJ catalog work from PR #12 / `publish-obj-issues` | Concurrent future catalog work | Preserve during rebase; do not replace OBJ until final multi-file companion behavior and provenance land |
| FBX catalog work | Concurrent future catalog work | Preserve during rebase; replace only if a self-contained official candidate is independently verified |
| RBXM work | Paused and unchanged | Out of scope |

No other current product placeholders were found in the maintained Node Assets Editor surface.

## User Stories

1. As a first-time Node Assets Editor user, I want the default built-in pipeline to use a recognizable
   official Babylon asset, so that the editor feels production-ready when it opens.
2. As a first-time user, I want startup to keep showing the existing loading status until the active
   default source is ready, so that I do not see a failed intermediate build.
3. As a first-time user, I want the rounded cube to build and appear in the preview after hydration,
   so that the default graph is immediately demonstrable.
4. As a user with a network failure, I want default-source errors to appear in the existing preview
   error UX, so that the editor explains why no preview is available.
5. As a pipeline library user, I want opening the library to avoid downloading every built-in source,
   so that browsing the catalog is inexpensive.
6. As a pipeline library user, I want selecting an entry to hydrate only that active graph, so that
   unrelated assets do not consume bandwidth.
7. As a multi-source pipeline user, I want both active source arms to hydrate before the graph builds,
   so that the merged result is complete.
8. As a returning pipeline user, I want a selected URL-only graph to hydrate from its exact authored
   source, so that downloaded bytes never outlive the graph and Read block that own them.
9. As a pipeline user, I want each built-in Read block to show its exact official CDN URL, so that the
   source is inspectable and reproducible.
10. As a bandwidth-conscious user, I want replaced built-in serializations to omit copied binary and
    base64 source data, so that the bundled catalog is smaller.
11. As a user switching graphs quickly, I want a slow previous hydration to be ignored, so that stale
    bytes cannot overwrite my newer selection.
12. As a user switching graphs quickly, I want a stale failure to be ignored, so that an abandoned
    graph cannot replace the active graph's status with an error.
13. As a user importing a local file, I want existing upload behavior to remain unchanged, so that CDN
    catalog sources do not disrupt authored workflows.
14. As a user editing a source URL, I want the last successful URL choice to remain active, so that
    source precedence stays predictable.
15. As a graph author, I want save and load behavior to remain compatible with URL and uploaded
    sources, so that my authored graphs round-trip.
16. As a graph author, I want hydrated source bytes to reach the existing worker build path, so that
    remote catalog graphs build the same way as uploaded graphs.
17. As a pipeline library user, I want all seven maintained pipeline identities and their ordering
    preserved, so that the catalog remains familiar.
18. As a glTF optimization user, I want **glTF Optimization** to use `roundedCube.glb`, so that its
    weld-and-prune path runs on representative indexed geometry with normals, tangents, and UVs.
19. As a multi-source user, I want the glTF arm to use the same rounded cube as the default graph, so
    that both roles demonstrate the same representative indexed source.
20. As an advanced compression user, I want the fence pillar source to include UVs and an embedded
    image, so that KTX2 and Draco demonstrate meaningful work.
21. As a full optimization user, I want `module_600.glb` to exercise multiple meshes, nodes, and
    materials, so that the complete Universal chain operates on a nontrivial graph.
22. As a full optimization user, I want the catalog to acknowledge that the source is already indexed,
    so that a no-op Weld Vertices result is not mistaken for a regression.
23. As a full optimization user, I want the completed build to emit tangents, so that Generate Tangents
    remains demonstrably effective.
24. As a Babylon source user, I want the Babylon logo to flow through Universal without external
    textures, so that the built-in graph remains self-contained.
25. As a USD importer user, I want the USDA triangle retained as an intentional conformance sample, so
    that USD behavior is tested honestly despite the absence of an official USD asset.
26. As a Node Geometry importer user, I want the Box graph retained as an intentional conformance
    sample, so that Node Geometry behavior is tested with its actual serialization format.
27. As a source-format user, I do not want an unrelated official asset presented as a USD or Node
    Geometry source, so that the catalog remains semantically accurate.
28. As an offline-build user, I want every selected official asset to be self-contained, so that no
    hidden companion request is needed.
29. As a security-conscious user, I want built-ins to use only the official Babylon assets host, so
    that no third-party asset service is introduced.
30. As a performance-conscious user, I want startup and on-demand transfers to stay within the approved
    byte budgets, so that representative assets do not make the editor heavy.
31. As a browser user, I want the official responses to permit cross-origin loading, so that CDN
    hydration works in the editor.
32. As a test maintainer, I want automated tests to remain network-independent, so that CDN uptime does
    not affect CI.
33. As a test maintainer, I want Playwright to serve deterministic locally generated responses at the
    exact official URLs, so that browser behavior and URL contracts are both covered.
34. As a test maintainer, I want unit tests to assert exact requested URLs, so that path or case drift
    fails immediately.
35. As a test maintainer, I want unit tests to prove hydration completes before worker serialization,
    so that a URL-only catalog entry cannot build with missing bytes.
36. As a test maintainer, I want unit tests to prove hydration does not become an authored graph
    change, so that a later reconcile or save does not schedule an unnecessary build.
37. As a test maintainer, I want unit tests to prove stale and active failure behavior, so that graph
    ownership and error semantics are deterministic.
38. As a test maintainer, I want exact catalog mapping assertions, so that every semantic role remains
    tied to its approved asset.
39. As a test maintainer, I want every maintained pipeline to emit a valid GLB from mocked source
    responses, so that the catalog remains executable without live network access.
40. As a browser-test maintainer, I want default loading, success, and failure status covered, so that
    users receive the expected preview UX.
41. As a browser-test maintainer, I want every library entry previewed and exported, so that later
    mappings are covered end to end.
42. As a release verifier, I want a separate browser pass against the real CDN, so that CORS, content
    type, source loading, and rendered output are verified outside CI.
43. As a release verifier, I do not want the real-CDN pass committed as a live-network test, so that CI
    remains deterministic.
44. As a maintainer, I want focused build, typecheck, format, unit, and Playwright checks to pass, so
    that the replacement is integration-ready.
45. As a maintainer, I want all code-review findings fixed before resolution, so that the feature does
    not ship known defects.
46. As an integration custodian, I want concurrent OBJ and FBX catalog entries preserved during
    rebases, so that this feature does not overwrite parallel work.
47. As an OBJ implementer, I want OBJ left unchanged until its final multi-file companion behavior and
    provenance land, so that this feature does not preempt that decision.
48. As an FBX implementer, I want replacement contingent on a verified self-contained official asset,
    so that the catalog never points at an incomplete source.
49. As an RBXM implementer, I want paused RBXM work excluded, so that unrelated scope is not revived.
50. As a dependency maintainer, I want this feature to add no packages, so that source replacement does
    not expand the dependency surface.
51. As a UI maintainer, I want intentional empty/error states and placeholder text left alone, so that
    asset cleanup does not alter unrelated affordances.
52. As a future investigator, I want the Babylon.js and Assets source snapshots and CDN probe evidence
    recorded, so that the mapping decision remains traceable.

## Implementation Decisions

1. **The maintained pipeline library remains the product surface.** Preserve exactly these names and
   this order: **glTF Optimization**, **USD to Optimized glTF**, **Babylon to Optimized glTF**,
   **Node Geometry to glTF**, **Multi-Source Universal Merge**, **Advanced glTF Compression**, and
   **Full Universal Optimization**.
2. **Mappings are role-specific.** The generated indexed triangle currently serves several roles, but
   Advanced compression receives the texture-bearing fence pillar while the default and Multi-Source
   glTF roles share the rounded cube.
3. **Built-in replaced sources are URL-only at rest.** Their catalog serialization contains the exact
   URL, `sourceKind: "url"`, and no copied source bytes/base64. Hydrated bytes are runtime state used by
   the existing worker build serialization.
4. **Use existing Read-block URL APIs.** Do not add a second downloader inside the runtime blocks.
   Provide the controller with the smallest high-level source hydration/fetch seam needed to inject
   deterministic responses and coordinate graph ownership.
5. **Hydrated bytes stay with the Read block.** Pass the injected fetcher directly through the existing
   URL API. Do not retain downloaded bytes or request-coordination state in the controller.
6. **Startup uses the existing orchestrator gate.** `BuildOrchestrator` continues to wait for
   `loadDefaultImportAsync()` before starting its first build. The method hydrates only the active
   default graph. If hydration fails, the existing error remains visible while the scheduler waits for
   a later authored graph change instead of building immediately.
7. **Every active build is hydration-safe.** Before serializing the active graph to the worker,
   controller build orchestration ensures its URL-backed Read blocks are hydrated. This covers later
   library selection and loaded URL-only graphs without prefetching inactive entries. Hydration then
   refreshes the internal build-relevant signature without notifying observers.
8. **Hydration is graph-revision owned.** Capture the current graph revision and Read-block identity.
   Apply bytes only if both still belong to the active graph. Use the Read API ownership guard so a
   stale success or failure cannot mutate a newer graph.
9. **Active failures stay failures.** Do not silently fall back to placeholder bytes or a success-shaped
   empty graph. Default failures use the existing startup preview error; later failures use the
   existing build error, preview status, and node diagnostic behavior.
10. **Library enumeration is inert.** Listing or opening the pipeline library performs no source
    requests. Selecting an entry makes it active; its next build hydrates only the URL sources in that
    graph.
11. **Multiple active sources hydrate as one graph.** Multi-Source Universal Merge resolves its rounded
    cube and Babylon logo arms before worker build serialization.
12. **Uploads and authored URLs remain first-class.** Preserve last-successful-source behavior,
    user-upload handling, URL edits, save/load, aggregate/Read shared properties, and worker builds.
13. **The USD and Node Geometry samples remain inline.** Relabel comments, test descriptions, and other
    maintained catalog language as needed to make their conformance purpose explicit. Do not add URL
    support or replace their formats.
14. **Generated glTF and Babylon placeholders leave production use.** Remove production catalog use
    of generated triangle GLBs and the generated Babylon triangle once all mapped roles are URL-backed.
    Keep only deterministic test generators that tests genuinely need.
15. **No binaries are vendored.** Official source assets remain on `assets.babylonjs.com`; Babylon.js
    receives URL strings only.
16. **No dependency changes.** Existing fetch, Read-block, controller, orchestrator, worker, and test
    infrastructure are sufficient.
17. **Asset paths are immutable inputs.** Use the exact mapping table and URL construction rule. Do not
    substitute a similarly named path, a redirecting URL, or a third-party mirror.
18. **Concurrent catalog work is merge-owned.** Rebase and integration must preserve landed OBJ/FBX
    entries and tests. Do not overwrite not-yet-landed work or broaden this feature to implement it.

## Network and Performance Constraints

| Scenario | Allowed official source transfer | Fetch behavior |
| --- | ---: | --- |
| Default startup: **glTF Optimization** | 13,624 bytes | One rounded cube request; no other catalog prefetch |
| Select **Advanced glTF Compression** | 115,728 bytes on demand | One fence pillar request |
| Select **Full Universal Optimization** | 10,996 bytes on demand | One `module_600.glb` request |
| Select **Multi-Source Universal Merge** | 21,282 bytes combined | One rounded cube request plus one Babylon logo request |

Additional constraints:

- All four selected assets are self-contained and require no companion file requests.
- Redirects are not part of the contract; the exact requested URL must be the final URL.
- Browser requests must accept the verified CORS response.
- A failed request must not fall back to embedded fixture bytes.
- Hydration must not change source identity, `sourceKind`, or graph ownership.
- Replaced sources should reduce bundled fixture bytes; no base64 copy remains in the maintained
  catalog serialization.

## Testing Decisions

1. **Test externally meaningful behavior.** Assert requested URL, active source identity, hydration
   timing, graph ownership, preview/build status, exported GLB validity, and mapped asset structure.
   Do not lock tests to private helper call order.
2. **Prefer the existing highest seam.** Exercise source hydration through
   `NodeAssetGraphController` and `BuildOrchestrator`, where startup, active graph ownership, and worker
   serialization meet. Introduce at most one injectable/mockable high-level source-fetch seam.
3. **Mock every automated source response.** Unit and Playwright tests must not contact the live CDN.
   Responses use deterministic locally generated bytes and are not copies of the official binaries.
4. **Unit coverage proves exact URL contracts.** Assert every mapped role requests its exact
   case-sensitive URL and that retained conformance samples do not request a URL.
5. **Unit coverage proves hydration ordering.** The build client must receive a serialization with
   resolved bytes only after mocked hydration succeeds. No build serialization is sent while the
   required active source is unresolved.
6. **Unit coverage proves ownership and failure behavior.** Cover active failure without worker
   serialization, superseded-graph safety, and build-signature stability after hydration.
7. **Catalog unit coverage remains comprehensive.** Preserve exact seven-name/order assertions,
   round-trip every graph, assert URL-only built-in mappings, retain the conformance samples, and build
   every graph to a valid GLB using mocked source responses.
8. **Replace placeholder-specific assertions.** Remove expectations tied to `Catalog Triangle`.
   Assert mapped content or structural outcomes: default attributes, Advanced compression relevance,
   Full graph validity and emitted tangents, Babylon self-containment, and valid merged output.
9. **Playwright intercepts exact URLs.** Register deterministic routes before editor startup. Cover the
   default loading/success/error UX and every catalog graph's preview/export without network access.
10. **Manual/cloud browser validation is separate.** Run the real development server against the actual
    CDN, inspect the rendered default and mapped entries, and record evidence. Do not commit a
    live-network test.
11. **Focused quality gates are required.** Run the relevant NodeAssets/Node Assets Editor build or
    typecheck, formatting, focused unit tests, and Node Assets Editor Playwright catalog coverage.
12. **Review closes the loop.** Run code review after implementation and fix every finding before both
    issues are resolved.

## Acceptance Criteria

- [ ] The exact default Read glTF serialization uses
      `https://assets.babylonjs.com/meshes/roundedCube.glb`, `sourceKind: "url"`, and no embedded source
      bytes/base64.
- [ ] Startup requests only the rounded cube, waits for hydration before the first worker build, and
      transfers 13,624 official bytes in real-CDN validation.
- [ ] Opening or listing the pipeline library performs no source prefetch.
- [ ] Selecting a later entry hydrates only the URL-backed Read blocks in that active graph before
      worker build serialization.
- [ ] Startup and later-build hydration refresh the internal build-relevant signature without
      publishing an authored graph change.
- [ ] A stale success and stale failure cannot mutate or report against a newer active graph.
- [ ] An active default or later hydration failure surfaces through the existing preview/build error
      UX, dispatches no incomplete worker build, and leaves startup subscribed for a later authored
      retry without an immediate build.
- [ ] **Advanced glTF Compression** uses the exact fence pillar URL and exercises both texture and
      geometry compression on deterministic structurally representative test data.
- [ ] **Full Universal Optimization** uses the exact `module_600.glb` URL, builds its complete graph,
      emits tangents, and does not require Weld Vertices to change already indexed geometry.
- [ ] **Babylon to Optimized glTF** and the Multi-Source Babylon arm use the exact Babylon logo URL.
- [ ] The Multi-Source glTF arm uses the exact rounded cube URL and a real-CDN load totals 21,282
      source bytes.
- [ ] The USDA triangle and Node Geometry Box remain inline, build successfully, and are identified as
      intentional importer conformance samples.
- [ ] Production catalog code no longer uses generated glTF or Babylon triangle placeholders.
- [ ] No official binary is copied into Babylon.js and no third-party URL, invented path, or dependency
      is introduced.
- [ ] User uploads, authored URL edits, last-successful-source behavior, save/load, aggregate source
      properties, and worker build behavior remain intact.
- [ ] All seven maintained pipeline identities and their ordering are preserved.
- [ ] Unit tests mock responses and prove exact URLs, hydration before serialization, active failure
      without worker dispatch, superseded-graph safety, signature stability, exact mappings, retained
      conformance samples, and valid GLB output for all pipelines.
- [ ] Playwright intercepts every exact asset URL with deterministic locally generated responses and
      covers default loading/success/error plus preview/export for every catalog graph.
- [ ] No committed automated test depends on the live network.
- [ ] Separate real-CDN browser validation loads and visually inspects the default plus every mapped
      library entry.
- [ ] Focused build/typecheck/format, unit, and Node Assets Editor Playwright checks pass.
- [ ] All code-review findings are fixed.
- [ ] Rebase/integration preserves concurrent OBJ and FBX catalog entries without implementing or
      overwriting their unresolved source decisions.

## Out of Scope

- Adding thumbnails to pipeline library controls.
- Changing preview empty/error UI or Properties/Search placeholder text.
- Replacing test-only fixtures, snapshots, documentation examples, generated previews, or historical
  tracker text unless a directly affected assertion must change.
- Modifying unrelated legacy tools.
- Adding official-looking but semantically invalid USD or Node Geometry URLs.
- Adding URL support solely to point at a substitute of the wrong format.
- Vendoring official assets or adding third-party asset hosts.
- Adding dependencies.
- Implementing or replacing OBJ before its final multi-file companion behavior and provenance land.
- Replacing FBX without a separately verified self-contained official candidate.
- Resuming paused RBXM work.
- Changing the seven maintained pipeline identities or ordering.

## Further Notes

Research was performed against:

- Babylon.js `preview/nae` snapshot
  `96845614095645a4d5d236a33510f391623dc691`.
- BabylonJS/Assets snapshot
  `8be9384c7f8728cb45d27975ac92a412f97a98dd`.

Direct cloud GET probes for all four selected URLs returned HTTP/2 200 at approximately
2026-07-21 08:33–08:40Z. Each stayed on the exact URL with no redirect, returned the expected content
type (`model/gltf-binary` or `model/vnd.babylonjs.v3+json`), returned a `Content-Length` matching the
mapping table, and included `Access-Control-Allow-Origin: *`.

Likely integration conflicts:

| Concurrent effort | Current signal | Custodian rule |
| --- | --- | --- |
| OBJ | PR #12 / `publish-obj-issues` may later touch the catalog and its tests | Preserve landed entries during rebase; do not replace OBJ until final companion behavior/provenance lands |
| FBX | A feature branch may later touch the same catalog surfaces | Preserve landed entries; replace only after a self-contained official asset is verified |
| RBXM | Paused, no changes | Keep out of scope |

Issue 01 is the prefactor/tracer bullet that proves the complete default path and reusable hydration
behavior. Issue 02 depends on it and extends the established path across the remaining catalog.
