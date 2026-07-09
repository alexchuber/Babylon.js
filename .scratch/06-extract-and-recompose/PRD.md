# PRD — 06 Extract & recompose

> Milestone 06 of the NodeAssets POC. Bridges the SCENE spine and the IMAGE lane: pull assets out of a
> scene, process them, and build richer assets back up. Extract/set are IMAGE-typed members of the
> slice-03 selector family, not new one-off nodes. This is the "compose up the funnel" showcase.

## Problem Statement

By now I can process scenes, process images, select and edit properties, and compose scenes — but the
lanes don't meet at the asset level. I can't take a texture *out* of a model, run it through my image
pipeline, and put it *back*. I can't take a bare, untextured mesh and an image and assemble a
finished, textured glTF from them. Extracting content from one format and incorporating it into a
higher-level format was one of the headline things this tool is supposed to make easy, and right now
it's impossible. I also don't want a pile of bespoke `ExtractTexture` / `SetTexture` nodes that
duplicate the selector mechanism I already built.

## Solution

Add the cross-lane bridge as **IMAGE-typed specializations of the slice-03 selector**: an
**ExtractTexture** node (a Get whose pointer names a texture slot and whose output is an IMAGE) and a
**SetTexture** node (a Set that writes an IMAGE into a texture slot). Add a **BuildPBRMaterial** node
that assembles a PBR material from image and scalar inputs and attaches it to a scene. Ship a premade
showcase graph that composes *up* the funnel: a bare untextured glTF plus an image become a finished,
textured glTF.

## User Stories

1. As a pipeline author, I want an ExtractTexture node that reads a material's texture slot and outputs
   it as an IMAGE, so that I can get a texture out of a model.
2. As a pipeline author, I want to run an extracted texture through image operations (resize, convert,
   composite), so that I can reprocess a model's textures with the 2D lane.
3. As a pipeline author, I want a SetTexture node that writes an IMAGE back into a material's texture
   slot, so that I can put the reprocessed texture back on the model.
4. As a pipeline author, I want extract/set to use the same pointer selector as GetProperty/SetProperty,
   so that addressing a texture works the same way as addressing any other property.
5. As a pipeline author, I want a BuildPBRMaterial node that takes base-colour / normal / metallic-
   roughness / emissive images plus factors, so that I can assemble a material from parts.
6. As a pipeline author, I want to assign a built material to a target mesh/material slot, so that the
   material actually lands on my geometry.
7. As a pipeline author, I want to combine a bare untextured mesh with an image to produce a textured
   glTF, so that I can build a finished asset from raw parts.
8. As a pipeline author, I want a ready-made example graph of this compose-up flow, so that I can see
   the whole story working end to end and adapt it.
9. As a pipeline author, I want a live preview of the recomposed, textured asset, so that I can confirm
   the texture landed correctly.
10. As a pipeline author, I want extract → process → set to round-trip without corrupting the rest of
    the model, so that I can safely reprocess textures in place.

## Implementation Decisions

- **Extract/Set as selector specializations.** ExtractTexture resolves a texture-slot pointer (e.g.
  `/materials/2/pbrMetallicRoughness/baseColorTexture`) through the slice-03 path→accessor converter,
  but returns the referenced texture's image bytes + mimeType as an **IMAGE** (rather than the JSON
  reference GetProperty would return). SetTexture is the inverse: it takes an IMAGE and writes/creates
  the texture at that slot. They are the IMAGE-typed members of the selector family; GetProperty/
  SetProperty remain the JSON-typed members. (ADR 0003.)
- **Converter extension.** Teach the converter's texture-slot handling to read a `Texture`'s image
  payload and to replace it, so both extract and set share one code path. No new pointer grammar.
- **BuildPBRMaterialBlock.** Inputs: a SCENE, optional IMAGE inputs (base colour, normal,
  metallic-roughness, emissive), scalar factor params, and an optional target pointer; it creates the
  textures and a PBR metallic-roughness material in the `Document` (wrapping gltf-transform's material/
  texture creation) and, if a target pointer is given, assigns it. Output is the SCENE.
- **Showcase premade graph.** A bundled example: ImportGLTF (bare, untextured mesh) + ImportImage →
  BuildPBRMaterial (base colour = the image), assigned to the mesh → ExportGLTF. This replaces the
  originally sketched "STL + image" source (STL was dropped) with a bare glTF source, keeping the
  compose-up story intact. Prior art: milestone-1's premade-graph/e2e effort.
- **Fan-out safety assumed.** Extract → process → set on a shared scene relies on slice-05's
  evaluate-once + copy-on-fan-out to stay correct; this slice depends on 05.

## Testing Decisions

- **Reuse the `buildAsync()` seam.** Tests build the graph, export, re-parse, and assert on the output
  asset — never on node internals.
- **Texture round-trip:** import a textured glTF → ExtractTexture → ResizeImage → SetTexture → export;
  assert the output texture has the new dimensions and the rest of the material is unchanged.
- **BuildPBRMaterial:** import a bare glTF + import an image → BuildPBRMaterial assigned to the mesh →
  export; assert the output has a PBR material with a baseColor texture and that the target mesh
  references it.
- **Showcase e2e:** the premade graph builds and produces a textured asset (assert material/texture
  counts and the mesh→material assignment). If it's driven through the editor, reuse the existing
  Playwright premade-graph coverage.
- **Canvas-dependent image steps** run at the Playwright seam per slice 04's note.

## Out of Scope

- Procedural texture generation, texture baking, UV unwrap/repack.
- Full material authoring beyond core PBR metallic-roughness + the common texture slots
  (base colour, normal, metallic-roughness, emissive, occlusion).
- Extracting non-texture assets (animation clips, meshes) into other formats — the same selector
  pattern could extend there later, but it's not in this slice.
- Automatic UV/material reconciliation when assigning a material to arbitrary geometry.

## Further Notes

- This slice is the concrete answer to the pitch's "extract things and incorporate them into other
  higher-level file formats" — done at the material/texture level, up the glTF funnel.
- Keeping extract/set as typed specializations of one converter (rather than standalone nodes) is the
  deliberate follow-through on the ADR-0003 decision: the selector is the single mechanism, and IMAGE
  vs JSON is just which port kind it terminates in.
- The bare-mesh showcase source can be a tiny bundled `.glb`; no new importer is needed.
