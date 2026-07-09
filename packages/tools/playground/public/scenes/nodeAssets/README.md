# NodeAssets Editor — sample assets

These files back the Node Assets Editor's bundled sample graphs.

## Energy-orb default graph

The editor opens on an **energy orb** showcase: two `ImportImage` sources (a dark metal base and a cyan
circuit pattern) composite into the base colour, the same pattern fans out to the emissive input, an
`ImportGLTF` sphere supplies the geometry to `BuildPBRMaterial`, and the built orb flows through KTX2 +
Draco compression to `ExportGLTF`.

- `orb.glb` — a UV sphere (POSITION, NORMAL, TEXCOORD_0 + indices) with **no material**, i.e. the bare
  geometry the graph textures and self-lights.
- `orbMetal.png` — a 512×512 dark, radially-shaded metal base colour.
- `orbPattern.png` — a 512×512 cyan circuit/reticle pattern with a transparent background, used both as
  the composite overlay and (fanned out) as the emissive glow.

## Compose-up test fixtures

- `bareCube.glb` — a tiny unit cube (POSITION, NORMAL, TEXCOORD_0) with **no material**.
- `baseColor.png` — a small 64×64 checker used as a base-colour texture.

These two back the headless compose-up unit test (`packages/dev/node-assets/test/unit/composeUpShowcase.test.ts`),
which exercises the `ImportGLTF` + `ImportImage` → `BuildPBRMaterial` → `ExportGLTF` build funnel without
the browser-only compositing path.

## Provenance / licence

All files are **self-generated** for this repository (via `@gltf-transform/core` + `sharp`). They contain
no third-party content and are released as **CC0 / public domain**, so there is no licence question.
