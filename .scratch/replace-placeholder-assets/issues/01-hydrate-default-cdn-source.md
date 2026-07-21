# Hydrate the default catalog source from Babylon CDN

Status: ready-for-agent

## What to build

Deliver the first complete official-CDN path for the maintained default **glTF Optimization**
pipeline. Its Read glTF source must serialize only the exact URL
`https://assets.babylonjs.com/meshes/roundedCube.glb` with `sourceKind: "url"` and no embedded
binary/base64 payload. The URL is the exact host plus case-sensitive Assets path
`meshes/roundedCube.glb`; the official response is 13,624 bytes and is a self-contained indexed GLB
with `POSITION`, `NORMAL`, `TANGENT`, and `TEXCOORD_0`.

Use the existing Read glTF URL API and the `NodeAssetGraphController` /
`BuildOrchestrator` startup boundary to add the smallest reusable high-level hydration seam. Startup
must hydrate only the active default graph before the first worker build. Successful bytes must be
reused by exact URL, and a graph-revision ownership guard must prevent stale successes or failures
from changing a newer graph.

Active failures must flow through the existing preview/build error experience. Preserve user uploads,
URL edits, last-successful-source behavior, save/load, aggregate source properties, and worker build
behavior. Do not prefetch other library entries, add dependencies, copy the official binary, or add a
live-network automated test.

Unit tests use injected deterministic responses to prove the exact URL request, hydration before
worker serialization, successful-byte reuse, and stale/active failure behavior. Playwright intercepts
the exact rounded cube URL with locally generated GLB bytes before editor startup and covers default
loading, successful preview/export, and failure status without contacting the CDN.

## User stories covered

1-18, 28-37, 40, 43-45, 50-52.

## Acceptance criteria

- [ ] The default built-in Read glTF serialization contains the exact rounded cube URL,
      `sourceKind: "url"`, and no copied source bytes/base64.
- [ ] No production catalog serialization or test expectation identifies the default source as
      `Catalog Triangle` or `catalog-triangle.glb`.
- [ ] The high-level source-fetch seam is injectable/mockable and reuses the existing Read glTF URL
      API rather than duplicating Read-block download logic.
- [ ] `BuildOrchestrator.start()` continues to show building status while
      `loadDefaultImportAsync()` hydrates the active default graph.
- [ ] The first worker build serialization is not sent until the rounded cube response succeeds and
      resolved bytes are present in the active Read block.
- [ ] Startup requests exactly
      `https://assets.babylonjs.com/meshes/roundedCube.glb` and no inactive library source.
- [ ] Separate real-CDN validation confirms an exact-URL, no-redirect, CORS-enabled response of 13,624
      bytes for the default source.
- [ ] A successful exact-URL response is reused without a second network fetch when the same source is
      needed again in the editor session.
- [ ] A hydration result applies only while the captured graph revision and Read block still belong to
      the active graph.
- [ ] A stale success cannot overwrite a newer graph or source selection.
- [ ] A stale failure cannot surface an error against a newer graph.
- [ ] An active startup failure prevents the build and appears through the existing preview error UX
      without fallback fixture bytes.
- [ ] The deterministic mocked rounded-cube response builds to a valid non-empty GLB whose structural
      assertions replace placeholder-name assertions.
- [ ] Playwright registers the exact CDN route before navigation, proves the default loading and
      successful preview/export path, and covers the existing error state with a deterministic failed
      response.
- [ ] Unit and Playwright tests make no live-network request and do not contain a copy of the official
      rounded cube binary.
- [ ] Uploads, authored URL changes, aggregate/Read shared source properties, save/load, and worker
      builds retain their established behavior.
- [ ] Focused build/typecheck/format, controller/orchestrator unit tests, default catalog tests, and
      Node Assets Editor Playwright checks pass.
- [ ] Code review is complete and every finding is fixed before the issue is marked `resolved`.

## Blocked by

None - can start immediately.
