# NodeAssets Editor — compose-up showcase assets

These files back the Node Assets Editor's ready-made **compose-up** graph
(`ImportGLTF` + `ImportImage` → `BuildPBRMaterial` → `ExportGLTF`).

- `bareCube.glb` — a tiny unit cube (POSITION, NORMAL, TEXCOORD_0) with **no material**, i.e. the
  bare, untextured mesh the showcase textures.
- `baseColor.png` — a small 64×64 checker used as the base-colour texture.

## Provenance / licence

Both files are **self-generated** for this repository (see `_/generateShowcaseAssets.mjs`, run once with
`@gltf-transform/core` + `sharp`). They contain no third-party content and are released as **CC0 /
public domain**, so there is no licence question.
