# Draco operation + "compression comes last" validation

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## What to build

Add geometry compression to the pipeline, plus the ordering rule that keeps compression where it
belongs.

- **A `draco` operation** (phase = compression). It tags the asset for Draco compression; the actual
  encode happens at write time, in-browser, via gltf-transform's own WASM path (loaded on demand).
  A pipeline of import → draco → export produces an output glTF whose geometry carries the
  `KHR_draco_mesh_compression` extension.
- **The phase concept** — operation definitions carry a phase (content or compression). This is
  metadata on the operation, orthogonal to the format types on the wires.
- **The compression-last validation rule** — a build-time check that warns when a content-editing
  operation consumes the output of a compression operation. Format compatibility and phase ordering
  stay separate concerns; this is a validation rule, not a wire type.

Draco's WASM loads via dynamic import so it isn't in the base bundle. The real end-to-end encode
into shippable bytes is exercised by the browser seam in slice 05; this slice's headless tests
assert the pipeline declares the extension on the export path and that the ordering rule fires
correctly.

## Acceptance criteria

- [ ] A `draco` operation is registered and runs through the runtime like any other operation.
- [ ] Running import → draco → export yields output glTF that declares `KHR_draco_mesh_compression`
      and loads through the Babylon glTF loader.
- [ ] Operation definitions carry a phase (content or compression).
- [ ] A graph with a content operation downstream of a compression operation raises a validation
      warning; a correctly-ordered graph does not.
- [ ] Draco's WASM loads via dynamic import.
- [ ] Headless vitest tests cover the Draco extension being declared on export and the
      compression-last validation firing / not-firing.

## User stories covered

PRD stories 4, 9, 29, 30, 31.

## Blocked by

- `01-runtime-spine`
