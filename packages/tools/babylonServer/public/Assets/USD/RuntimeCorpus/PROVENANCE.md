# USD loader corpus — provenance & attribution

A pinned set of representative USD assets used by loader integration tests and
deterministic Playground-backed visualization tests. Every asset is loaded through
the public `SceneLoader` interface; no internal parser APIs are exercised here.

Assets are served by the existing local Babylon CDN server at
`/Assets/USD/RuntimeCorpus/…` — no external asset upload is needed.

## Source snapshot

Assets derive from **provided-source-runtime-corpus-v1** (snapshot date: 2026-07-30).
The snapshot label is a neutral identifier for the original provided source of
representative USD shapes; it does not imply a specific public repository or
release. Re-pin intentionally by updating hashes and the snapshot label.

Some files are committed byte-for-byte from the source; others are redacted
derivatives with authoring-environment identifiers replaced by neutral
placeholders (see Modifications). Hashes and sizes below reflect committed
fixture bytes.

> **TODO — Licensing verification:** Formal redistribution permission for these
> assets has not yet been verified. Confirm the license terms before including
> them in any public release or distribution.

## Per-file provenance

Paths are relative to this directory. Hashes are SHA-256 over the **committed
fixture bytes** (which may differ from the original source when neutral
redactions have been applied — see the Modifications section).

| File | Description | SHA-256 (committed) | Size (bytes) | Sidecars |
| ---- | ----------- | ------------------- | ------------ | -------- |
| `Box.usda` | Unit cube via implicit UsdGeomCube with authored size (redacted derivative) | `d182a886584fd2c4d886cc56852280ac9625911fb6d0ec244fc565b8878798a2` | 205 | None |
| `Cone.usda` | Cone via implicit UsdGeomCone with authored radius, height, and axis | `e613871f2518722667c435dd9aa6dc2f925e8496a36388c2303a5775f01149b7` | 272 | None |
| `DeliveryBox.usda` | USDA wrapper exercising the optional external-asset handler with OBJ/MTL sidecars | `e24af6aa2e1af8f3a500fe3aba8c259ebad025f97a57a800dc8f9645b0cb5994` | 525 | `DeliveryBox/DeliveryBox.obj`, `DeliveryBox/DeliveryBox.mtl` |
| `DeliveryBox/DeliveryBox.obj` | Delivery Box geometry sidecar | `a807116330157780ea20a3a44ae36bcd8d9806ca18c96dab013e685d3bc1364a` | 13,704 | `DeliveryBox/DeliveryBox.mtl` |
| `DeliveryBox/DeliveryBox.mtl` | Delivery Box material sidecar | `84fefbdd1c6b4338cbea17ffda4ea6c70142b3af4084e6473b9d1439325a5060` | 208 | (sidecar of DeliveryBox.obj) |
| `Plane.usda` | Single quad mesh on the XZ plane with constant authored normals | `8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974` | 583 | None |
| `HospitalBed/Hospital_Bed.usda` | Large polygon mesh with face-varying normals/UVs, PreviewSurface material, and relative diffuse texture | `dd8afae46e2571f3801363e9dc3385ceb075a3122e6ba7f8f3ff66dd2da13e64` | 9,418,448 | `HospitalBed/textures/HospitalBed_Diffuse.png` |
| `HospitalBed/textures/HospitalBed_Diffuse.png` | Diffuse texture sidecar for Hospital_Bed.usda | `2a765428504204e8c9bc2cc8dc5058996677e528f52c24ccbf21b3c841e353b3` | 2,319,219 | (sidecar of Hospital_Bed.usda) |
| `RobotArm2/RobotArm.usda` | Large multi-mesh Z-up centimeter-scale robot arm with MDL-only materials, authored face-varying normals, no UVs (redacted derivative — see Modifications) | `63ea1085c87e394e70aecec81d866cc349c0b247617f6d41731ad76f5290f7e4` | 25,766,794 | None |
| `Cylinder.usda` | Implicit UsdGeomCylinder with authored radius, height, and axis | `5a333b133ae1c90088594135de8336eed63e7a55c93a0eae170c5a9d5d6fa95e` | 284 | None |
| `Room.usda` | Modular room shell via implicit UsdGeomCube (default size=2) with authored display colors and 50% opacity | `e8f466bbfede76a4e8ac6e78ddb663539a7539f0074e8746fb465faa90dbe163` | 3,301 | None |
| `stairs.usda` | Eight-step staircase via implicit UsdGeomCube (default size=2) with authored display colors; actual step dimensions 2.4 × 0.36 × 0.5 | `64a1426fa181ce3342fffaffcfa8c3fe346a75ba73a07127773e3abbd4571fc7` | 3,717 | None |
| `Placeholder.usda` | Empty container asset with a single named Xform group and no geometry | `bb319d84281cb65685220f338e2f700ab8dfe206d9e44e7859955bda7f25c9d7` | 259 | None |
| `seahorse_anim_mtl_variant.usda` | Placeholder wrapper with a single named Xform group and no geometry (redacted derivative — see Modifications) | `4db81909e2487d3d319b5b573a1e41c5487e226ea342f7fe20bf9bc5adea3f0f` | 253 | None |

## Embedded attribution

Any copyright or attribution text embedded in the original asset files is
preserved verbatim. Retain it.

`DeliveryBox/DeliveryBox.obj` retains its embedded Blender attribution header.

## Modifications

- `Box.usda` is a redacted derivative: application-specific comments were removed
  for neutral provenance. The original byte-preserved hash is stored only in local
  session artifacts, not in this public document.
- `RobotArm2/RobotArm.usda` is a redacted derivative: the original `asset_id` custom
  property value and one absolute Windows texture path (`inputs:ORM_texture`) were replaced
  with neutral placeholders to remove authoring-environment identifiers. The replacement
  preserves the same USD structure and nonportable-path test behavior.
- `seahorse_anim_mtl_variant.usda` is a redacted derivative: authoring-environment
  identifiers and application-specific implementation references in the comment were removed
  and replaced with a neutral description. The USD data and prim structure (defaultPrim,
  metersPerUnit, upAxis, and single Xform prim) are unchanged from the source; committed
  bytes and hash reflect the neutral comment derivative.

`Room.usda` and `stairs.usda`: unmodified from their provided-source form.
Source comments in these files describe legacy intent (e.g. room dimensions,
door gap width, step dimensions) but the standard UsdGeomCube default `size=2`
(half-extent 1) governs the rendered output. Scale values are multipliers on
the Cube's [-1,1] local extent, making rendered dimensions double the scale
values. Authored USD semantics take precedence.

All other files are unmodified from their provided-source form.

## Sidecars

- `HospitalBed/textures/HospitalBed_Diffuse.png` is the diffuse texture referenced by
  `HospitalBed/Hospital_Bed.usda` (`asset inputs:file = @./textures/HospitalBed_Diffuse.png@`)
  and is kept beside it so relative asset-path resolution works.
- `DeliveryBox.usda` references `./DeliveryBox/DeliveryBox.obj`, whose `mtllib`
  statement resolves `DeliveryBox.mtl` beside the OBJ.
