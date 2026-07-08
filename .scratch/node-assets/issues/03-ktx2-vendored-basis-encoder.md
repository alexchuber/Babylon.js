# KTX2 operation — vendored browser Basis encoder

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## What to build

Add texture compression — the operation that proves the day-one thesis, because gltf-transform
can't encode KTX2 in the browser and this operation reaches for a different engine behind the same
node interface.

- **Vendor the browser Basis→KTX2 encoder** into the node-assets package. It wraps Binomial's
  `basis_universal` encoder WASM served from the Babylon CDN (the same pattern as the existing Draco
  encoder), runs in a worker pool with a main-thread fallback, and emits a KTX2 container directly.
  Prototype to reuse: the `basisu-encoder` branch of this repo (the Basis encoder + worker files
  under core's `Misc`). Expose a **raw-pixels entry point** (RGBA + width/height/format/color-space →
  KTX2 bytes) — the prototype only exposes a Babylon-texture path, but the pipeline holds raw image
  bytes.
- **A `ktx2` operation** (phase = compression). Per texture in the asset: read the image, decode it
  to RGBA + dimensions, enforce the encoder's constraints (dimensions a multiple of 4, standard
  dynamic range only, no cube maps — clear error otherwise), encode to KTX2 (ETC1S for color, UASTC
  for non-color), write the result back onto the texture, and declare `KHR_texture_basisu` on the
  asset.
- **Load the Basis encoder via dynamic import** (bundle-size hygiene, same as Draco). The encoder is
  just the engine this one operation reaches for — not a runtime-level provider threaded through the
  architecture. Its worker pool already falls back to the main thread when workers are absent, so it
  can run headless; whether this slice's headless tests drive the real vendored encoder or substitute
  it is left to this slice to decide. The real in-browser encode is proven by the browser seam in
  slice 05.

The encoder WASM loads on demand (dynamic import / CDN), not in the base bundle.

## Acceptance criteria

- [ ] The vendored Basis encoder exposes a raw-pixels entry point (RGBA + dimensions + format +
      color-space → KTX2 bytes).
- [ ] A `ktx2` operation is registered with phase = compression.
- [ ] Running import → ktx2 → export produces output glTF that declares `KHR_texture_basisu` on the
      compressed textures, with correctly decoded RGBA + dimensions handed to the encoder per texture.
- [ ] The operation enforces the encoder constraints (multiple-of-4 dimensions, LDR only, no cube
      maps), surfacing a clear error when violated.
- [ ] The encoder WASM loads via dynamic import / CDN as in the prototype.
- [ ] Headless vitest tests cover the `KHR_texture_basisu` declaration and the per-texture
      RGBA/dimension hand-off, with the encoder-vs-substitute choice left to this slice.

## User stories covered

PRD stories 5, 29, 30, 31, 32.

## Blocked by

- `01-runtime-spine`
