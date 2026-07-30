# USD loader corpus — provenance & attribution

A pinned set of representative USD assets used by loader integration tests and
deterministic Playground-backed visualization tests. Every asset is loaded through
the public `SceneLoader` interface; no internal parser APIs are exercised here.

Assets are served by the existing local Babylon CDN server at
`/Assets/USD/RuntimeCorpus/…` — no external asset upload is needed.

## Source snapshot

All files were copied byte-for-byte from **provided-source-shapes-v1** (snapshot
date: 2026-07-30). The snapshot label is a neutral identifier for the original
provided source of representative USD shapes; it does not imply a specific public
repository or release. Re-pin intentionally by updating hashes and the snapshot
label.

> **TODO — Licensing verification:** Formal redistribution permission for these
> assets has not yet been verified. Confirm the license terms before including
> them in any public release or distribution.

## Per-file provenance

Paths are relative to this directory. Hashes are SHA-256 over the original,
byte-preserved fixture bytes.

| File | Description | SHA-256 | Size (bytes) | Sidecars |
| ---- | ----------- | ------- | ------------ | -------- |
| `Box.usda` | Unit cube via implicit UsdGeomCube with authored size | `d182a886584fd2c4d886cc56852280ac9625911fb6d0ec244fc565b8878798a2` | 205 | None |
| `Plane.usda` | Single quad mesh on the XZ plane with constant authored normals | `8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974` | 583 | None |

## Embedded attribution

Any copyright or attribution text embedded in the original asset files is
preserved verbatim. Retain it.

## Modifications

`Box.usda`: application-specific comments removed for neutral provenance.
All other files are unmodified from their provided-source form.

## Sidecars

No sidecar files are required for assets in this directory at this time.
