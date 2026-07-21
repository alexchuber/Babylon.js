# Hydrate the default catalog source from Babylon CDN

Status: resolved

## What to build

Deliver the first complete official-CDN path for the maintained default **glTF Optimization**
pipeline. Its Read glTF source must serialize only the exact URL
`https://assets.babylonjs.com/meshes/roundedCube.glb` with `sourceKind: "url"` and no embedded
binary/base64 payload. The URL is the exact host plus case-sensitive Assets path
`meshes/roundedCube.glb`; the official response is 13,624 bytes and is a self-contained indexed GLB
with `POSITION`, `NORMAL`, `TANGENT`, and `TEXCOORD_0`.

Use the existing Read glTF URL API and the `NodeAssetGraphController` /
`BuildOrchestrator` startup boundary to add the smallest injectable high-level hydration seam.
Startup must hydrate only the active default graph before the first worker build. Pass the injected
fetcher directly through the existing `setUrlAsync` API, and use graph-revision plus Read-block
ownership guards to prevent stale successes or failures from changing a newer graph.

Active failures must flow through the existing preview/build error experience. Preserve user uploads,
URL edits, last-successful-source behavior, save/load, aggregate source properties, and worker build
behavior. Do not prefetch other library entries, add dependencies, copy the official binary, or add a
live-network automated test.

Unit tests use injected deterministic responses to prove the exact URL request, hydration before
worker serialization, active failure without worker dispatch, superseded-graph safety, and
non-startup build-signature stability. Playwright intercepts the exact rounded cube URL with locally
generated GLB bytes before editor startup and covers default loading, successful preview/export, and
failure status without contacting the CDN.

## User stories covered

1-18, 28-37, 40, 43-45, 50-52.

## Acceptance criteria

- [x] The default built-in Read glTF serialization contains the exact rounded cube URL,
      `sourceKind: "url"`, and no copied source bytes/base64.
- [x] No production catalog serialization or test expectation identifies the default source as
      `Catalog Triangle` or `catalog-triangle.glb`.
- [x] The high-level source-fetch seam is injectable/mockable and passes the injected fetcher through
      the existing Read glTF URL API rather than duplicating Read-block download logic.
- [x] `BuildOrchestrator.start()` continues to show building status while
      `loadDefaultImportAsync()` hydrates the active default graph.
- [x] The first worker build serialization is not sent until the rounded cube response succeeds and
      resolved bytes are present in the active Read block.
- [x] Startup requests exactly
      `https://assets.babylonjs.com/meshes/roundedCube.glb` and no inactive library source.
- [x] Separate real-CDN validation confirms an exact-URL, no-redirect, CORS-enabled response of 13,624
      bytes for the default source.
- [x] Startup and subsequent default-source hydration refresh the build-relevant signature without
      notifying observers, so a later reconcile or save does not schedule an unnecessary build.
- [x] A hydration result applies only while the captured graph revision and Read block still belong to
      the active graph.
- [x] A stale success cannot overwrite a newer graph or source selection.
- [x] A stale failure cannot surface an error against a newer graph.
- [x] An active startup failure prevents the build and appears through the existing preview error UX
      without fallback fixture bytes; the scheduler then waits for an authored graph change without
      starting an immediate build.
- [x] The deterministic mocked rounded-cube response builds to a valid non-empty GLB whose structural
      assertions replace placeholder-name assertions.
- [x] Playwright registers the exact CDN route before navigation, proves the default loading and
      successful preview/export path, and covers the existing error state with a deterministic failed
      response.
- [x] Unit and Playwright tests make no live-network request and do not contain a copy of the official
      rounded cube binary.
- [x] Uploads, authored URL changes, aggregate/Read shared source properties, save/load, and worker
      builds retain their established behavior.
- [x] Focused build/typecheck/format, controller/orchestrator unit tests, default catalog tests, and
      Node Assets Editor Playwright checks pass.
- [x] Code review is complete and every finding is fixed before the issue is marked `resolved`.

## Delivery

- [x] Final feature head: `8ad10d8b28549a6f3ae29a63a64aae1e48257c09`.
- [x] Corrective minimization head: `14945be3d0bb3f342564d6fb7a848720c7e0258a`.
- [x] Landed on `preview/nae` at `580d6514575480a7b17a5acf68098c9048b6c5a7`.
- [x] The corrective head, final feature head, and landing commit all resolve to the exact validated
      tree `8a5ea4d39b2c45ddee98e2c459cd055c5253cc0d`.
- [x] Integration retained the hardening fixes for touch-generated palette focus, absolute desktop OBJ
      paths, and cleanup errors no longer masking the original OBJ conversion failure, together with
      their focused regressions.

## Validation

- [x] Source, NodeAssets, and Viewer prerequisites passed.
- [x] Format passed once and lint passed once.
- [x] Full unit validation completed: 369 files, 5,449 passed, 1 expected failure, and 30 skipped.
- [x] The Node Assets Editor deployment build passed.
- [x] Full Node Assets Editor Playwright passed 47/47 with `workers=1` and `retries=0`.
- [x] The live exact URL returned HTTP 200, 13,624 bytes, `model/gltf-binary`,
      `Access-Control-Allow-Origin: *`, and no redirect.

## Review

- [x] Sol/max dual-lens review completed with all findings integrated before landing.

## Dependency

None. The issue is resolved and landed.
