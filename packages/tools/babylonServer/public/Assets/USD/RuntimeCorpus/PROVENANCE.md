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
| `DialysisMachine.usda` | USDA wrapper for dialysis machine OBJ/MTL sidecars via the optional external-asset handler with authored -90° X rotation and 0.02 uniform scale (redacted derivative — see Modifications) | `1c56f082c5de599e6d7ab83f781c4bf70a9e0594cc8152afe705f691ff30af91` | 543 | `DialysisMachine/DialysisMachine.obj`, `DialysisMachine/DialysisMachine.mtl` |
| `DialysisMachine/DialysisMachine.obj` | Dialysis machine geometry sidecar (392K+ lines, 89K vertices, 32 material groups) | `2c45313495ef44acad8e5e46a931d078f4d63f480398a004f0cddffe0c8a2796` | 14,301,576 | `DialysisMachine/DialysisMachine.mtl` |
| `DialysisMachine/DialysisMachine.mtl` | Dialysis machine material sidecar with 32 materials (redacted derivative — see Modifications) | `2c922fa528c9cd349daa69341e61bf95093e1b3c47a320fe23af67933edad1af` | 2,983 | (sidecar of DialysisMachine.obj) |
| `Plane.usda` | Single quad mesh on the XZ plane with constant authored normals | `8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974` | 583 | None |
| `HospitalBed/Hospital_Bed.usda` | Large polygon mesh with face-varying normals/UVs, PreviewSurface material, and relative diffuse texture | `dd8afae46e2571f3801363e9dc3385ceb075a3122e6ba7f8f3ff66dd2da13e64` | 9,418,448 | `HospitalBed/textures/HospitalBed_Diffuse.png` |
| `HospitalBed/textures/HospitalBed_Diffuse.png` | Diffuse texture sidecar for Hospital_Bed.usda and Hospital_Bed.mtl | `2a765428504204e8c9bc2cc8dc5058996677e528f52c24ccbf21b3c841e353b3` | 2,319,219 | (sidecar of Hospital_Bed.usda and Hospital_Bed.mtl) |
| `HospitalBedWrapper.usda` | USDA wrapper for the authored Hospital Bed OBJ sidecar with authored uniform scale `0.0254` | `68355c920d910f7d41560bec10e228cfabf235f4a1909ad2e4d9cb3d34924a02` | 791 | `HospitalBed/Hospital_Bed.obj` |
| `HospitalBed/Hospital_Bed.obj` | Hospital Bed geometry sidecar; its `mtllib` statement resolves the MTL beside it | `86d69e91b25777a51f26b8098baf71af45383e29018bc409a444682e9221f3cf` | 5,695,903 | `HospitalBed/Hospital_Bed.mtl` |
| `HospitalBed/Hospital_Bed.mtl` | Single-material MTL sidecar; references diffuse, specular, and normal maps | `8216690fbaabdc854957449e0802af140270f4be680ae402d74398f0ba9f05e1` | 503 | `HospitalBed/textures/HospitalBed_Diffuse.png`, `HospitalBed/textures/HospitalBed_Specular.png`, `HospitalBed/textures/HospitalBed_Normal.png` |
| `HospitalBed/textures/HospitalBed_Specular.png` | Specular texture referenced by Hospital_Bed.mtl | `9c7f1a3badda2824b4c341c05a7de3b2a4aaed9e166378a9d6c33e72f6f16838` | 39,062 | (sidecar of Hospital_Bed.mtl) |
| `HospitalBed/textures/HospitalBed_Normal.png` | Bump/normal texture referenced by Hospital_Bed.mtl | `6fa3af8f0c88ff8ef029ecb6cc5c27a1a3423d731a8a123e707f1cca91148040` | 1,812,528 | (sidecar of Hospital_Bed.mtl) |
| `RobotArm2/RobotArm.usda` | Large multi-mesh Z-up centimeter-scale robot arm with MDL-only materials, authored face-varying normals, no UVs (redacted derivative — see Modifications) | `63ea1085c87e394e70aecec81d866cc349c0b2476176f41731ad76f5290f7e4` | 25,766,794 | None |
| `Cylinder.usda` | Implicit UsdGeomCylinder with authored radius, height, and axis | `5a333b133ae1c90088594135de8336eed63e7a55c93a0eae170c5a9d5d6fa95e` | 284 | None |
| `Room.usda` | Modular room shell via implicit UsdGeomCube (default size=2) with authored display colors and 50% opacity | `e8f466bbfede76a4e8ac6e78ddb663539a7539f0074e8746fb465faa90dbe163` | 3,301 | None |
| `stairs.usda` | Eight-step staircase via implicit UsdGeomCube (default size=2) with authored display colors; actual step dimensions 2.4 × 0.36 × 0.5 | `64a1426fa181ce3342fffaffcfa8c3fe346a75ba73a07127773e3abbd4571fc7` | 3,717 | None |
| `Placeholder.usda` | Empty container asset with a single named Xform group and no geometry | `bb319d84281cb65685220f338e2f700ab8dfe206d9e44e7859955bda7f25c9d7` | 259 | None |
| `Sphere.usda` | Implicit UsdGeomSphere with authored radius = 0.5 | `bb63928fb419e0addea97c29c8c3ab6e2e5d62501f56f0c573af17e0dc73ec48` | 217 | None |
| `seahorse_anim_mtl_variant.usda` | Placeholder wrapper with a single named Xform group and no geometry (redacted derivative — see Modifications) | `4db81909e2487d3d319b5b573a1e41c5487e226ea342f7fe20bf9bc5adea3f0f` | 253 | None |

## Embedded attribution

Any copyright or attribution text embedded in the original asset files is
preserved verbatim. Retain it.

`DeliveryBox/DeliveryBox.obj` retains its embedded Blender attribution header.

`DialysisMachine/DialysisMachine.obj` retains its embedded DEEP Exploration / Right Hemisphere
attribution header.

`HospitalBed/Hospital_Bed.obj` and `HospitalBed/Hospital_Bed.mtl` retain their embedded
Wavefront exporter attribution header.

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
- `DialysisMachine.usda` is a redacted derivative: a manufacturer/model identifier in the
  comment was replaced with a neutral description. The USD data and prim structure are
  unchanged from the source; committed bytes and hash reflect the neutral comment derivative.
- `DialysisMachine/DialysisMachine.mtl` is a redacted derivative: a manufacturer/model
  identifier in the header comment was replaced with a neutral description. Material
  definitions are unchanged; committed bytes and hash reflect the neutral comment derivative.

`Room.usda` and `stairs.usda`: unmodified from their provided-source form.
Source comments in these files describe legacy intent (e.g. room dimensions,
door gap width, step dimensions) but the standard UsdGeomCube default `size=2`
(half-extent 1) governs the rendered output. Scale values are multipliers on
the Cube's [-1,1] local extent, making rendered dimensions double the scale
values. Authored USD semantics take precedence.

All other files are unmodified from their provided-source form.

The Hospital Bed wrapper and its five committed sidecars are unmodified byte-for-byte.
The authored MTL references `HospitalBed_Diffuse.png`, `HospitalBed_Specular.png`, and
`HospitalBed_Normal.png`; the available `HospitalBed_Glossiness.png` alternative is
intentionally not copied and is not requested by the test handler. The wrapper graph
contains no GLB or binary USD reference, and no such file is vendored.

> **TODO — Hospital Bed licensing:** Verify redistribution permission and attribution
> requirements for the wrapper, OBJ, MTL, and three referenced PNG sidecars before any
> public release.

## Sidecars

- `HospitalBed/textures/HospitalBed_Diffuse.png` is the diffuse texture referenced by
  `HospitalBed/Hospital_Bed.usda` (`asset inputs:file = @./textures/HospitalBed_Diffuse.png@`)
  and is kept beside it so relative asset-path resolution works.
- `DeliveryBox.usda` references `./DeliveryBox/DeliveryBox.obj`, whose `mtllib`
  statement resolves `DeliveryBox.mtl` beside the OBJ.
- `DialysisMachine.usda` references `./DialysisMachine/DialysisMachine.obj`, whose `mtllib`
  statement resolves `DialysisMachine.mtl` beside the OBJ.
- `HospitalBedWrapper.usda` references `./HospitalBed/Hospital_Bed.obj`.
- `HospitalBed/Hospital_Bed.obj` references `Hospital_Bed.mtl`; that MTL references the
  diffuse, specular, and normal PNG files listed above. `HospitalBed_Glossiness.png` is
  an unreferenced alternative and is intentionally absent.
