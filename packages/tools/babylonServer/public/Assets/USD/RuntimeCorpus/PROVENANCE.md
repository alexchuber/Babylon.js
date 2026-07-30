# USD loader corpus — provenance & attribution

A pinned set of representative USD assets used by loader integration tests and
deterministic Playground-backed visualization tests. Every asset is loaded through
the public `SceneLoader` interface; no internal parser APIs are exercised here.

Assets are served by the existing local Babylon CDN server at
`/Assets/USD/RuntimeCorpus/…` — no external asset upload is needed.

## Source snapshot

Files originate from **provided-source-shapes-v1** (snapshot date: 2026-07-30).
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

Paths are relative to this directory. Hashes are SHA-256 over the committed
fixture bytes.

| File | Description | SHA-256 | Size (bytes) | Sidecars |
| ---- | ----------- | ------- | ------------ | -------- |
| `Plane.usda` | Single quad mesh on the XZ plane with constant authored normals | `8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974` | 583 | None |
| `HospitalBed/Hospital_Bed.usda` | Large polygon mesh with face-varying normals/UVs, PreviewSurface material, and relative diffuse texture | `dd8afae46e2571f3801363e9dc3385ceb075a3122e6ba7f8f3ff66dd2da13e64` | 9,418,448 | `HospitalBed/textures/HospitalBed_Diffuse.png` |
| `HospitalBed/textures/HospitalBed_Diffuse.png` | Diffuse texture sidecar for Hospital_Bed.usda | `2a765428504204e8c9bc2cc8dc5058996677e528f52c24ccbf21b3c841e353b3` | 2,319,219 | (sidecar of Hospital_Bed.usda) |
| `RobotArm2/RobotArm.usda` | Large multi-mesh Z-up centimeter-scale robot arm with MDL-only materials, authored face-varying normals, no UVs (redacted derivative — see Modifications) | `63ea1085c87e394e70aecec81d866cc349c0b247617f6d41731ad76f5290f7e4` | 25,766,794 | None |

## Embedded attribution

Any copyright or attribution text embedded in the original asset files is
preserved verbatim. Retain it.

## Modifications

- `RobotArm2/RobotArm.usda` is a redacted derivative: the original `asset_id` custom
  property value and one absolute Windows texture path (`inputs:ORM_texture`) were replaced
  with neutral placeholders to remove authoring-environment identifiers. The replacement
  preserves the same USD structure and nonportable-path test behavior. All other files are
  unmodified from their provided-source form.

## Sidecars

- `HospitalBed/textures/HospitalBed_Diffuse.png` is the diffuse texture referenced by
  `HospitalBed/Hospital_Bed.usda` (`asset inputs:file = @./textures/HospitalBed_Diffuse.png@`)
  and is kept beside it so relative asset-path resolution works.
