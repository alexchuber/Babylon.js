# 01 — Block self-registration (kill the hand-maintained switch + descriptor table)

Status: ready-for-agent

## Parent

`.scratch/02-scene-spine-and-usd/PRD.md` · Glossaries: `CONTEXT-MAP.md` (runtime + editor contexts),
`packages/dev/node-assets/CONTEXT.md` (**block descriptor**: "as of milestone 02 blocks self-register
their descriptor at module load rather than being hand-listed in a central table").

## Goal

Replace the **two** hand-maintained lookup tables — the runtime `CreateBlockByClassName` switch in
`nodeAsset.ts` and the parallel editor `BlockDescriptors` table in `blockCatalog.ts` — with
**self-registration**, so each block registers its own class-name → factory (runtime) and palette
descriptor (editor) at module load. Adding a block becomes a single local change, and the whole class of
"forgot to register the block" load-crash disappears. Lock it in with a save/load regression test.

## The bug this kills

`KTX2CompressionBlock` was omitted from the runtime switch in milestone 1, so loading a saved graph that
contained a KTX2 block threw `Cannot deserialize unknown block type "KTX2CompressionBlock"`. It was later
patched by hand-adding the `case` — but the **fragile mechanism remains**: the next block author must
remember to touch the switch **and** the editor descriptor table, or ship the exact same crash.
Self-registration removes the footgun; the regression test is the one that "would have caught the
milestone-1 bug."

## Why this is its own slice

It is a small, self-contained infrastructure change with no dependency on the SCENE rename, USD import,
or operators — it can run fully in parallel. Landing it makes issues 02 and 03 pure additions (each new
block self-registers) instead of edits to a shared central table.

## KISS ground rules (read first)

- **Minimal self-registration, not a framework.** A module-level `Map<className, factory>` that each
  block adds to at import time (a tiny `RegisterBlock(ClassName, factory)` next to the class) is enough.
  Do **not** build a plugin system, DI container, or capability registry — out of scope per the PRD.
- **Two registries, because there are two layers.** The runtime maps `className → block factory` (for
  `Parse`); the editor maps `className → palette descriptor` (label, color, create/configure). Keep the
  editor registry in the **app layer** so the reusable framework stays runtime-free (editor CONTEXT).
- **Beware tree-shaking / side-effect drops.** Registration by import side-effect only works if the
  block modules are actually imported. Ensure the runtime and editor entry points pull in the block
  modules (a barrel import is fine) so their registration runs. `@babylonjs/node-assets` is a dev
  package; confirm the block barrel is reachable from the runtime entry.

## What to build

- **Runtime** — delete the `CreateBlockByClassName` switch; introduce a small registry keyed by
  `ClassName`. Each block registers its factory `(name, nodeAsset) => new XBlock(name, nodeAsset)` at
  module load. `NodeAsset.Parse` looks the factory up and still throws a clear error for a genuinely
  unknown type. Sketch:

  ```ts
  // registration lives next to each block:
  RegisterBlock(KTX2CompressionBlock.ClassName, (name, asset) => new KTX2CompressionBlock(name, asset));
  ```

- **Editor** — replace the static `BlockDescriptors` array with descriptors that each block's editor-side
  module registers (keyed by `className` / `paletteItemId`). `GetBlockDescriptorByPaletteItemId`,
  `GetBlockDescriptorForBlock`, and the `paletteCategories` build read from the registry. Preserve
  `ConfigureBlockForEditor`'s wasm-URL injection behavior.
- **Palette grouping** keeps working (today a single "Blocks" category; the USD and operator slices add
  "Sources" / "Operators" categories via their own registrations).

## Tests

Headless `buildAsync()` is the primary seam:

- **Save/load regression** — build a graph containing a `KTX2CompressionBlock` (e.g.
  Import → KTX2 → Export), `serialize()` it, `NodeAsset.Parse()` it back, and assert the KTX2 block is
  reconstructed (correct class + connections intact) and the reparsed graph still `buildAsync()`es. This
  test must fail against the old omitted-switch state and pass with self-registration — it is the test
  that would have caught the milestone-1 omission.
- **Registration coverage** — parametrize over the registered classes and assert every exported block
  round-trips through save/load, so a future block cannot silently drop out.
- **Editor Playwright** only if the palette wiring needs interaction coverage; prefer the headless seam.
  Existing editor Playwright tests must stay green.

## Acceptance criteria

- [ ] The runtime `CreateBlockByClassName` switch is gone; blocks self-register a `className → factory`
      at module load; `NodeAsset.Parse` uses the registry and still throws a clear error for truly
      unknown types.
- [ ] The editor `BlockDescriptors` static table is gone; descriptors self-register; palette build and
      load-time descriptor lookup read from the registry; `ConfigureBlockForEditor` wasm injection is
      preserved.
- [ ] Adding a block requires **no** edit to any central switch or table (demonstrated by the USD /
      operator slices being pure additions).
- [ ] A save/load regression test reconstructs a KTX2-containing graph and rebuilds it; parametrized
      coverage asserts every registered block round-trips.
- [ ] No plugin system / DI / capability registry is introduced — just a minimal `Map`-backed registry.
- [ ] Existing headless + editor tests stay green; `lint:check` + `format:check` pass.

## Blocked by

None — can start immediately, in **parallel** with issue 00 (SCENE rename).

## Note for whoever merges

Touches the same block files / `src/index.ts` as issue 00 (rename) and adds a registration call next to
each block. No logic overlap with the rename — expect trivial conflicts if both run as separate branches.
Issues 02 (USD) and 03 (operators) **benefit** from this but are not hard-blocked: if this has landed
they self-register (one local change); if it has not, they add themselves to the existing switch + table
by hand, exactly as Draco/KTX2 do today.
