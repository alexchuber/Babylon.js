# 03 — BuildPBRMaterial block (assemble a PBR material from images + factors into a SCENE)

Status: ready-for-agent

## Parent

`.scratch/06-extract-and-recompose/PRD.md` (user stories 5, 6) · Glossary:
`packages/dev/node-assets/CONTEXT.md` (**BuildPBRMaterial**: "assembles a PBR metallic-roughness material
from IMAGE inputs (base colour, normal, metallic-roughness, emissive) and factor params, attaches it to a
SCENE, and optionally assigns it at a target pointer. The 'compose up the funnel' tool") · Decisions:
`docs/adr/0001-scene-spine-is-gltf-transform-document.md` (the material is created in the SCENE
`Document`) · `docs/adr/0003-generic-selector-is-gltf-object-model-json-pointer.md` (the optional
target-assign reuses a pointer + the converter, not a bespoke assign node).

## Goal

Add the **BuildPBRMaterial** block: inputs a SCENE, optional IMAGE inputs (base colour, normal,
metallic-roughness, emissive), scalar factor params, and an optional target pointer; it creates the
textures and a PBR **metallic-roughness** material in the SCENE `Document` and, if a target pointer is
given, assigns that material at the target. Output is the SCENE. This is the "compose up the funnel"
primitive — it lets a graph turn a bare mesh plus loose images into a finished, textured asset.

## Why this is its own slice

It is a self-contained SCENE→SCENE block: the only new logic is "create textures + a PBR-MR material in a
`Document` and optionally assign it." It is independent of the extract/set pair (issues 00–02) — it
*creates* textures rather than reading/replacing existing ones — so it can be built in parallel with them.
It is the runtime half of the compose-up story; the bundled showcase graph that dramatizes it is issue 04.

## KISS ground rules (read first)

- **Model on the operator blocks** (`dracoCompressionBlock.ts` / `weldBlock.ts`) — extend
  `NodeAssetBlock`, one `SCENE` input + one `SCENE` output, plus optional `IMAGE` inputs and scalar params;
  work in `_buildBlockAsync`; **dynamic-`import`** any gltf-transform helper inside the body.
- **Core PBR metallic-roughness only.** Base colour, normal, metallic-roughness, emissive (+ optionally
  occlusion) texture slots and their factor params (baseColorFactor, metallicFactor, roughnessFactor,
  emissiveFactor). Full material authoring is **out of scope** (PRD). Do **not** build a general material
  graph or a slot-plugin system.
- **Optional inputs are optional.** A missing IMAGE input simply means that slot is left unset (factor-only
  is valid). Only create a `Texture` for slots that have an IMAGE.
- **Assign via the pointer + converter, not a bespoke path.** If a target pointer is given, assign the new
  material at it by reusing the slice-03 converter's material-slot set (e.g. a mesh-primitive's material
  reference) — the same mechanism SetProperty uses (ADR 0003). Do **not** invent a separate "assign
  material" node.
- **In-place mutation is retained**; do not clone (fan-out is slice 05).

## What to build

- **`BuildPBRMaterial`** — `SCENE` input; optional `IMAGE` inputs `baseColor`, `normal`,
  `metallicRoughness`, `emissive`; scalar factor params as public serialized properties; optional `STRING`
  target-pointer input; `SCENE` output. `_buildBlockAsync` creates the textures (one per supplied IMAGE) and
  a PBR-MR material on the `Document`, sets the factors, optionally assigns at the target, and passes the
  `Document` through. Sketch:

  ```ts
  // src/Blocks/buildPBRMaterial.ts
  export class BuildPBRMaterial extends NodeAssetBlock {
      public static override ClassName = "BuildPBRMaterial";
      public baseColorFactor: [number, number, number, number] = [1, 1, 1, 1]; // property line
      public metallicFactor = 1;
      public roughnessFactor = 1;
      public emissiveFactor: [number, number, number] = [0, 0, 0];
      public readonly scene: NodeAssetConnectionPoint;             // SCENE
      public readonly baseColor: NodeAssetConnectionPoint;         // IMAGE (optional)
      public readonly normal: NodeAssetConnectionPoint;            // IMAGE (optional)
      public readonly metallicRoughness: NodeAssetConnectionPoint; // IMAGE (optional)
      public readonly emissive: NodeAssetConnectionPoint;          // IMAGE (optional)
      public readonly target: NodeAssetConnectionPoint;            // STRING pointer (optional)
      public readonly output: NodeAssetConnectionPoint;            // SCENE
      // _buildBlockAsync:
      //   const document = this.scene.value as Document;
      //   const mat = document.createMaterial().setRoughnessFactor(...)...;
      //   for each supplied IMAGE: const tex = document.createTexture().setImage(data).setMimeType(mime);
      //                            mat.setBaseColorTexture(tex) / setNormalTexture(tex) / ...;
      //   if (this.target.value) ResolvePointer(document, this.target.value).set(mat-reference);
      //   this.output.value = document;
  }
  ```

- **Editor exposure** — a palette entry (self-registered if slice-01 is in place, else added to the catalog
  by hand). Grouping: reuse the **Selectors**/composition grouping or an appropriate existing category —
  match how MergeScenes (slice 05) is grouped rather than inventing a new one-off category. Optional IMAGE
  inputs render as ports; factors render as property lines.
- Export from `src/index.ts`.

## Tests

Headless `buildAsync()` is the primary seam — build, export, re-parse, assert on the output `Document`:

- **Build + assign (headline, PRD Testing Decisions)** — ImportGLTF(a bare, untextured mesh) +
  ImportImage(a base-colour image) → BuildPBRMaterial(baseColor = the image, target = the mesh's material
  slot) → ExportGLTF; re-parse and assert the output has a **PBR material with a baseColor texture** and
  that the **target mesh references it**.
- **Factor-only, no images** — BuildPBRMaterial with only factors set (no IMAGE inputs) produces a material
  with those factors and **no** textures; it still exports.
- **Multiple slots** — supplying baseColor + normal + emissive creates three textures on the material,
  wired to the correct slots.
- **No target pointer** — the material is created in the `Document` but not assigned; the export still
  contains it (as an unused material) and the graph builds.
- **Passes the SCENE through** — output is a valid SCENE that exports and can be chained.

## Acceptance criteria

- [ ] `BuildPBRMaterial` exists in `src/Blocks/`, `SCENE` in → `SCENE` out, with optional `IMAGE` inputs
      (baseColor, normal, metallicRoughness, emissive), scalar factor properties, and an optional `STRING`
      target-pointer input; modeled on the operator blocks.
- [ ] It creates the textures (only for supplied IMAGE inputs) and a PBR **metallic-roughness** material in
      the `Document`, sets factors, and — when a target pointer is given — assigns the material there via
      the slice-03 converter (no bespoke assign node).
- [ ] Scope is core PBR-MR + the common slots only; **no** general material graph / slot-plugin abstraction;
      in-place mutation retained (no cloning).
- [ ] The block self-registers, is exported from `src/index.ts`, and appears in the palette (grouped
      consistently with the composition blocks).
- [ ] Headless `buildAsync()` tests assert, through export + re-parse: build+assign (material with
      baseColor texture, target mesh references it), factor-only, multiple-slot, no-target, and
      chain-through. They pass.
- [ ] `lint:check` + `format:check` pass; any new gltf-transform helper import is dynamic and inside the
      block body.

## Blocked by

- **slice-04 issue 00 — `00-image-lane-foundation.md`** for the `IMAGE` kind + payload type + `ImportImage`
  (the material's texture inputs are IMAGE payloads). **Hard block.** *(On branch
  `alexchuber-issue-ify-slice-04`, not yet on dev; reference by intent.)*
- **slice-03 issue 02 — `02-pointer-to-accessor-converter.md`** for the optional target-assign path (assign
  the material at a pointer via the converter's material-slot set). **Hard block only for the assign
  feature**; the create-material core does not need it. *(On branch
  `alexchuber-issueify-slice-03-scalar-wires`.)*
- **Independent of issues 00–02** (it creates textures rather than extracting/replacing them) — can run in
  parallel with the extract/set track.
- Assumes **slice 02** has landed.

## Note for whoever merges

BuildPBRMaterial's texture creation overlaps conceptually with issue 00's create-on-replace path; if both
land, keep the texture-creation helper in **one** place (prefer the converter's) rather than duplicating it.
