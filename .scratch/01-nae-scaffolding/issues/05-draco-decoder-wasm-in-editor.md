# 05 — Fix in-editor Draco WASM (serve encoder + decoder same-origin)

Status: ready-for-agent

## Parent

`.scratch/01-nae-scaffolding/PRD.md` → "PRD Addendum: Milestone 1 Completion" (this is **Slice 1** of
that effort) · Glossaries: `CONTEXT-MAP.md` (runtime + editor contexts) · Originally the in-browser
defect inherited from issue 03 (`.scratch/01-nae-scaffolding/issues/03-draco-compression-block.md`).

## User stories covered

Addendum stories 18 (in-browser Draco import/export works), 20 (blocks accept injected WASM), 23
(backend unit tests remain green). Unblocks the default Draco pipeline in Slice 4 (issue 09).

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

**This effort's default graph contains a Draco node** (Import → KTX2 → Draco → Export), so it is not
enough to *skip* or *swallow* the Draco load — both the **decoder** (used on import / preview re-import)
and the **encoder** (used on export) must actually **work** in-browser. A try/catch-only fix (candidate
approach 1) would stop the crash but leave the default pipeline unable to produce its Draco output.

**Approach (locked): serve the Draco WASM same-origin.** Import both the Draco **encoder** and
**decoder** wasm as URLs from the root `node_modules` (a `?url` import, exactly mirroring how the block
catalog already serves the KTX2 / Basis encoder wasm) and inject those URLs into the runtime
`ImportGLTFBlock` and `ExportGLTFBlock`, which pass them to the `draco3dgltf` module loader
(`locateFile` / `wasmBinary`). Give those blocks an **injectable WASM-location input** so headless (from
`node_modules`) and browser (served) contexts both work. The load stays **unconditional** — once the
wasm is served with the right MIME type it is harmless. (Conditional "load only when Draco is present"
is deferred as polish; see the addendum's Out of Scope.)

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

- [ ] The Draco **encoder** and **decoder** wasm are served same-origin via `?url` root-`node_modules`
      imports (mirroring the KTX2 / Basis pattern in the editor's block catalog).
- [ ] The runtime `ImportGLTFBlock` and `ExportGLTFBlock` accept an **injectable Draco WASM location**
      and pass it through to `draco3dgltf` (`locateFile` / `wasmBinary`); headless resolution from
      `node_modules` still works with no injection.
- [ ] In the editor (browser), `Import → Export` of a non-Draco glb succeeds and yields a valid
      downloadable glb (no wasm compile error in console).
- [ ] In the editor (browser), a graph **containing a Draco node** (e.g. `Import → Draco → Export`)
      builds, exports a Draco-compressed glb, and previews it — no `WebAssembly.instantiate` crash and
      no degraded/error path.
- [ ] A unit test verifies the blocks accept an injected Draco WASM location (block-contract level, no
      browser).
- [ ] The existing editor Playwright `Import → Export` and `Import → KTX2 → Export` tests pass.
- [ ] Headless unit tests remain green; `lint:check` + `format:check` pass.

## Blocked by

None — can start immediately. (Runs in parallel with issues 07 and 08; it is a hard blocker for
issue 09.)
