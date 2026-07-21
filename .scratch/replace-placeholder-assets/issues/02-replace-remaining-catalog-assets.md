# Replace the remaining catalog assets and validate every pipeline

Status: ready-for-agent

## What to build

Extend the source hydration behavior established by issue 01 across every remaining maintained
built-in pipeline role:

| Role | Exact URL | Expected bytes |
| --- | --- | ---: |
| Multi-Source glTF arm | `https://assets.babylonjs.com/meshes/roundedCube.glb` | 13,624 |
| Advanced glTF Compression | `https://assets.babylonjs.com/meshes/graveYardPack/fenceAPillar1/fenceAPillar1.glb` | 115,728 |
| Full Universal Optimization | `https://assets.babylonjs.com/meshes/module_600.glb` | 10,996 |
| Babylon optimization and Multi-Source Babylon arm | `https://assets.babylonjs.com/meshes/babylonJS_logo_v3.babylon` | 7,658 |

Each replaced Read block must serialize the exact URL with `sourceKind: "url"` and no copied
binary/base64 payload. Multi-Source Universal Merge must hydrate both active arms before build and
reuse rounded-cube bytes when issue 01 already cached them.

Remove production catalog use of the generated glTF and Babylon triangle placeholders. Retain the
inline USDA triangle and Node Geometry Box graph as explicit importer conformance samples because the
official Assets repository has no honest source in either format. Preserve all seven pipeline names
and their ordering.

Update comprehensive unit and Playwright catalog coverage with deterministic local source responses.
Assertions must describe mapped content and structural outcomes rather than `Catalog Triangle`.
Advanced compression must exercise texture and geometry compression; Full Universal Optimization
must build its complete graph and emit tangents, while recording that its already indexed geometry
may make Weld Vertices a no-op. Every catalog entry must preview and export a valid GLB without a
live-network test.

After automated checks, run a separate real-CDN development-server browser validation for the default
and mapped library entries. Confirm the rendered results and network contracts without committing
that live check.

During rebase and integration, preserve any landed OBJ/FBX catalog entries and tests. Do not replace
OBJ before its final multi-file companion behavior/provenance land, replace FBX only after a
self-contained official candidate is verified, and leave paused RBXM work untouched.

## User stories covered

5-10, 16-30, 32-52.

## Acceptance criteria

- [ ] Every mapped Read block serializes its exact case-sensitive CDN URL with
      `sourceKind: "url"` and no copied source bytes/base64.
- [ ] **Advanced glTF Compression** uses only the exact fence pillar URL and deterministic test data
      with indexed geometry, UVs, and an embedded image so KTX2 and Draco are meaningfully exercised.
- [ ] **Full Universal Optimization** uses only the exact `module_600.glb` URL and deterministic
      structurally representative data for its multi-mesh, multi-node, multi-material path.
- [ ] The Full Universal Optimization result is a valid GLB with tangents; tests and maintained notes
      allow Weld Vertices to be a no-op because the official source is already indexed.
- [ ] **Babylon to Optimized glTF** and the Multi-Source Babylon arm use only the exact Babylon logo
      URL and require no external texture request.
- [ ] The Multi-Source glTF arm uses only the exact rounded cube URL, both active arms hydrate before
      build, and rounded-cube bytes are reused when already cached.
- [ ] Cold real-CDN source transfer is 115,728 bytes for Advanced, 10,996 bytes for Full, and 21,282
      combined bytes for Multi-Source.
- [ ] Production catalog code no longer uses generated glTF or Babylon triangle payloads.
- [ ] The USDA triangle remains inline and is clearly identified in maintained code/tests as an
      intentional USD importer conformance sample with source label `catalog-triangle.usda`.
- [ ] The Node Geometry Box graph remains inline and is clearly identified in maintained code/tests as
      an intentional Node Geometry importer conformance sample with source label `catalog-box.json`.
- [ ] No URL support or unrelated-format substitute is added for the retained conformance samples.
- [ ] All seven maintained pipeline names and their ordering remain unchanged.
- [ ] Catalog unit tests assert every exact mapping, the two retained conformance samples, and no
      production placeholder use.
- [ ] Mocked unit builds hydrate sources before serialization and produce a valid non-empty GLB for
      every maintained pipeline without live network access.
- [ ] Placeholder-name expectations are replaced by mapped content or structural assertions, including
      Advanced compression relevance, Full tangents, valid Babylon conversion, and valid merged output.
- [ ] Playwright intercepts every exact URL with deterministic locally generated responses, never
      copied official binaries.
- [ ] Playwright lists, hydrates, previews, and exports every maintained catalog graph and verifies
      active failure UX without contacting the live CDN.
- [ ] Separate real-CDN browser validation inspects the rendered default, Advanced, Full, Babylon, and
      Multi-Source entries and records successful exact-URL/no-redirect/CORS behavior.
- [ ] No binary asset, third-party URL, invented Assets path, dependency change, or live-network
      automated test is committed.
- [ ] User uploads, authored URL edits, save/load, aggregate source properties, worker builds, and
      retained USD/Node Geometry workflows remain intact.
- [ ] Rebase/integration preserves landed OBJ and FBX catalog entries/tests and leaves RBXM unchanged.
- [ ] Focused build/typecheck/format, relevant unit tests, and the Node Assets Editor Playwright catalog
      suite pass.
- [ ] Code review is complete and every finding is fixed before the issue is marked `resolved`.

## Blocked by

- [01 — Hydrate the default catalog source from Babylon CDN](./01-hydrate-default-cdn-source.md)
