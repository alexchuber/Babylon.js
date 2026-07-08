# 05 — Draco decoder WASM fails to load in the editor (breaks in-browser Import→Export)

Status: needs-triage

## Parent

`.scratch/01-nae-scaffolding/PRD.md` · Glossaries: `CONTEXT-MAP.md` (runtime + editor contexts) · Defect in issue 03
(`.scratch/01-nae-scaffolding/issues/03-draco-compression-block.md`)'s in-browser integration.

## What to build

Importing a glb in the Node Assets **editor** (browser) currently fails. `ImportGLTFBlock`
unconditionally loads the Draco **decoder** WASM (`draco3dgltf`) on _every_ import, but the editor's
Vite server doesn't serve the emscripten wasm sidecar — the fetch falls back to `index.html`, so
`WebAssembly.instantiate` fails:

```
[NodeAssetsEditor] Export failed: Aborted(CompileError: WebAssembly.instantiate():
  expected magic word 00 61 73 6d, found 3c 21 64 6f @+0)      // 3c 21 64 6f = "<!do"
wasm streaming compile failed: Incorrect response MIME type. Expected 'application/wasm'.
```

Because the decoder loads on every import (not just Draco inputs), this breaks the plain
`Import → Export` graph and every downstream graph (e.g. `Import → KTX2 → Export`) in the editor.
Headless/unit paths are unaffected (they resolve the wasm from `node_modules`).

After the fix, an in-browser `Import → Export` of an ordinary (non-Draco) glb must succeed and download
a valid glb; a Draco-compressed glb must either import correctly in the editor or degrade with a clear,
actionable error — never a raw wasm compile crash.

Two candidate approaches (implementer's choice; first is smaller):

1. **Make the decoder load resilient** — register/instantiate the Draco decoder only when the input is
   actually Draco-compressed, and/or wrap it in try/catch so non-Draco imports don't fail when the
   decoder wasm can't load.
2. **Serve the Draco wasm from the editor** — configure the editor Vite server to serve `draco3dgltf`'s
   wasm sidecar (mirroring how the KTX2 block's Basis encoder wasm is served via `?url`
   root-`node_modules` imports).

## Current state (editor Playwright suite is RED on branch `dev-04-ktx2-compression-block`)

Two of the three editor Playwright tests fail today because of this bug; the third passes because it
never imports a glb (so it never loads the decoder):

- ❌ `imports a glb, wires the graph, exports a roundtripped glb, and previews it` (plain
  `Import → Export`) — Export throws on the draco wasm compile, so no `download` event fires and the
  test times out.
- ❌ `compresses textures to KTX2 and exports a KHR_texture_basisu glb` (`Import → KTX2 → Export`) —
  same root cause; blocked only by this bug (the KTX2 encode itself is fine headless).
- ✅ `seeds a real Import/Export starter graph from the backend` — passes; seeds a graph and never
  imports a glb, so the decoder never loads.

Repro (needs the :1337 CDN server and the :1348 editor dev server running):

```
npx playwright test -c playwright.config.ts --project=nodeAssetsEditor --reporter=list
```

Note: issue 04 (KTX2) is marked landed in the PRD and its backend/unit tests + `lint`/`format` are
green, but its **editor Playwright roundtrip is red on this branch until 05 is fixed** — the failure is
this inherited dev/issue-03 defect, not the KTX2 block.

## Acceptance criteria

- [ ] In the editor (browser), `Import → Export` of a non-Draco glb succeeds and yields a valid
      downloadable glb (no wasm compile error in console).
- [ ] The existing editor Playwright `Import → Export` test passes.
- [ ] `Import → KTX2 → Export` in the editor passes (was blocked only by this bug).
- [ ] A Draco-compressed glb either imports correctly in the editor or fails with a clear error — never
      a raw `WebAssembly.instantiate` magic-word crash.
- [ ] Headless unit tests remain green; `lint:check` + `format:check` pass.

## Blocked by

None — can start immediately.
