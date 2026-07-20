# NodeAssets Editor — sample assets

These files back the Node Assets Editor's bundled default graph.

## Orb compression default graph

The editor opens on a compact compression graph: an `ImportGLTF` sphere flows through KTX2 and Draco
transforms to `ExportGLTF`. The bundled sphere has no textures, so KTX2 becomes effective when the input
is replaced with a textured glTF.

- `orb.glb` — a UV sphere (POSITION, NORMAL, TEXCOORD_0 + indices) with **no material**, i.e. the bare
  geometry the graph optimizes.

## Provenance / licence

All files are **self-generated** for this repository (via `@gltf-transform/core` + `sharp`). They contain
no third-party content and are released as **CC0 / public domain**, so there is no licence question.
