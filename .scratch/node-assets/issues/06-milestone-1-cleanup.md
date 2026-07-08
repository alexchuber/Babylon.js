# Milestone-1 cleanup: rename feature, rewrite PRD as-built, split CONTEXT.md per package

Status: ready-for-human

## Parent

`.scratch/node-assets/PRD.md` (this issue renames that directory — see step 1).

## Why

Milestone 1 is landing — **Node Editor UI · glTF in / glTF out · Draco + KTX2 compression** — and the
tracker and docs have drifted from what was actually built:

- The feature slug `node-assets` is generic. This effort was really the **first milestone**: the
  scaffolding of the whole Node Assets Editor (NAE). Naming it as such lets later milestones
  (`02-…`, `03-…`) sit beside it.
- `PRD.md` still frames Draco/KTX2 compression as **"Deferred / explicitly NOT in the MVP,"** but
  compression is part of milestone 1 and has been built out (Draco landed; KTX2 in progress). The PRD
  no longer reflects the product that exists.
- The domain glossary lives at `.scratch/node-assets/CONTEXT.md` — the wrong place. Per this repo's
  multi-context layout (`docs/agents/domain.md`), glossaries belong at each package's context root,
  indexed by a root `CONTEXT-MAP.md`. And there are really **two** domains here — the runtime backend
  and the editor tool — which want **two** glossaries.

## What to do

### 1. Rename the feature slug

Rename `.scratch/node-assets/` → `.scratch/01-nae-scaffolding/` (use `git mv` so history follows).
Update any in-repo references to the old path: this issue's `Parent`, the PRD's "Issues" section, and
the `Parent` line of each sibling issue.

### 2. Rewrite the PRD as-built (product-level, high-level)

Rewrite `PRD.md` so it describes **what milestone 1 actually shipped**, not the original speculative
PoC plan. Keep it **high-level and product-facing** — the milestone-1 definition is simply:

- Node Editor UI
- glTF in, glTF out
- Draco + KTX2 compression

Move the compression blocks out of "Deferred" and into delivered scope. Trim the deep
implementation/deferred detail that has either been built or is genuinely milestone-2+ material. This
is a product-level summary of the milestone, not an engineering spec.

### 3. Split the glossary into two package-level CONTEXT.md files + a root map

By the end there must be **two** `CONTEXT.md` files, each at its package's context root:

- `packages/dev/node-assets/CONTEXT.md` — the **runtime / graph** domain (NodeAsset, block, connection
  point, connection, the Import/Export glTF blocks, the compression blocks, the gltf-transform
  `Document` payload). This is mostly what today's `.scratch/node-assets/CONTEXT.md` already covers.
- `packages/tools/nodeAssetsEditor/CONTEXT.md` — the **editor** domain (the visual canvas, nodes,
  ports, wires, frames, the palette / properties panes, the reusable framework vs. the app, the
  preview).

Add a root `CONTEXT-MAP.md` listing both contexts and how they relate (the editor authors and previews
what the runtime builds), per `.agents/skills/domain-modeling/CONTEXT-FORMAT.md`. Remove the old
`.scratch/…/CONTEXT.md` once its content has migrated.

**Before finalizing the glossaries, reconcile them against the code and with the user:**

1. Read the existing glossary in the current `CONTEXT.md`.
2. Compare each term against **what is actually implemented in code** in `packages/dev/node-assets` and
   `packages/tools/nodeAssetsEditor` — do the class names, connection-point naming, block names, and
   the payload type still match the glossary? Did anything get renamed during implementation?
3. Where the glossary and the code disagree, **do not silently pick one** — surface each conflict and
   **have a dialogue with the user** to decide the canonical term before writing it down. Keep each
   `CONTEXT.md` a pure glossary (no implementation detail), per the domain-modeling format.

## Acceptance criteria

- [ ] `.scratch/node-assets/` is renamed to `.scratch/01-nae-scaffolding/` (via `git mv`); no stale
      references to the old path remain in the tracker.
- [ ] `PRD.md` reads as a high-level, product-level summary of **as-built** milestone 1 (Node Editor UI
      · glTF in/out · Draco + KTX2), with compression no longer listed as deferred.
- [ ] `packages/dev/node-assets/CONTEXT.md` exists and captures the runtime / graph glossary.
- [ ] `packages/tools/nodeAssetsEditor/CONTEXT.md` exists and captures the editor glossary.
- [ ] A root `CONTEXT-MAP.md` points to both and describes their relationship.
- [ ] Every term in both glossaries has been checked against the actual code, and all glossary/code
      conflicts were resolved in dialogue with the user (not silently).
- [ ] The old `.scratch/…/CONTEXT.md` is removed once its content has migrated.

## Blocked by

None — but the CONTEXT reconciliation step needs the user in the loop; this is not a fully-AFK issue.
