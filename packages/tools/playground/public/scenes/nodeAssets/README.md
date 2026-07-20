# NodeAssets Editor — compatibility assets

The production built-in catalog embeds deterministic fixtures and does not fetch these files. These assets
remain available for compatibility tests and manually loaded graphs.

## Legacy orb sample

- `orb.glb` — a UV sphere (POSITION, NORMAL, TEXCOORD_0 + indices) with no material.

## Load-only compatibility test fixtures

- `bareCube.glb` — a tiny unit cube (POSITION, NORMAL, TEXCOORD_0) with no material.
- `baseColor.png` — a small 64×64 checker used as a base-colour texture.

These fixtures back the headless compose-up compatibility test. They are not bundled library examples or
palette-discoverable workflows.

## Provenance / licence

All files are **self-generated** for this repository (via `@gltf-transform/core` + `sharp`). They contain
no third-party content and are released as **CC0 / public domain**, so there is no licence question.
