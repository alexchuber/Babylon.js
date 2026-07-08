# Live preview round-trip (browser)

Status: ready-for-agent

## Parent

`.scratch/node-assets/PRD.md`

## What to build

Make the editor show a live 3D preview of the **real** output — the whole reason the pipeline runs
the actual encoders instead of an approximation.

The editor hosts a Babylon engine, scene, and glTF loader with a viewport. When the graph changes:

- **After a ~10s debounce**, automatically rebuild.
- **A rebuild runs the whole pipeline with the real Draco + KTX2 encoders in-browser**, writes the
  actual output glTF (this is when compression truly happens), then **re-imports those exact bytes**
  through the Babylon glTF loader into the viewport — so the preview equals the deliverable and
  doubles as a check that the output loads.
- **Supersede an in-flight rebuild** when another change lands: cancel/ignore the stale result so a
  newer change never gets overwritten by an older rebuild.
- **Per-node memoization** keyed on a node's settings plus its upstream state, so editing one node
  re-runs only that node and everything downstream of it.
- **Any-node preview** — the author can preview a selected node's intermediate result, not just the
  final export.
- **Preview-state indicators** — waiting, rebuilding, done, errored.

This slice is the **secondary test seam**: a Playwright browser test that runs a small real pipeline
(real Draco + KTX2), and asserts the compressed output re-imports through the glTF loader and
renders in the viewport. This is the only test that exercises the real WASM encoders + loader +
viewport end-to-end.

## Acceptance criteria

- [ ] The editor hosts a Babylon engine + scene + glTF loader with a live viewport.
- [ ] Changing the graph triggers an automatic rebuild after a ~10s debounce.
- [ ] A rebuild runs the whole pipeline with real Draco + KTX2 encode, writes output glTF, and
      re-imports those bytes into the viewport (preview = deliverable).
- [ ] A change landing mid-rebuild supersedes the in-flight rebuild; a stale result never replaces a
      newer one.
- [ ] Per-node memoization means editing one node re-runs only that node and its downstream.
- [ ] The author can preview a selected node's intermediate result, not just the export.
- [ ] Preview-state indicators show waiting / rebuilding / done / errored.
- [ ] A Playwright browser test runs a small real pipeline (real Draco + KTX2) and asserts the
      compressed output re-imports through the glTF loader and renders. (Prior art: the repo's
      existing Playwright visualization tests and the devhost validation flow.)

## User stories covered

PRD stories 11, 12, 13, 14, 15, 16, 17, 18.

## Blocked by

- `02-draco-and-compression-validation`
- `03-ktx2-vendored-basis-encoder`
- `04-fluent-node-editor`
