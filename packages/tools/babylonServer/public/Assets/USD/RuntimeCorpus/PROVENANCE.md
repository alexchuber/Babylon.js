# USD loader corpus — provenance & attribution

A pinned set of representative USD assets used by loader integration tests and
deterministic Playground-backed visualization tests. Every asset is loaded through
the public `SceneLoader` interface; no internal parser APIs are exercised here.

Assets are served by the existing local Babylon CDN server at
`/Assets/USD/RuntimeCorpus/…` — no external asset upload is needed.

## Source snapshot

All files were copied from a provided-source snapshot of representative USD shapes
and assets. The snapshot is pinned for reproducibility; re-pin intentionally.

> **TODO — Licensing verification:** Formal redistribution permission for these
> assets has not yet been verified. Confirm the license terms before including
> them in any public release or distribution.

## Per-file provenance

Paths are relative to this directory.

| File | Description | SHA-256 | Size (bytes) | Sidecars |
| ---- | ----------- | ------- | ------------ | -------- |
| `Plane.usda` | Single quad mesh on the XZ plane with constant authored normals | `8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974` | 583 | None |

## Embedded attribution

Any copyright or attribution text embedded in the original asset files is
preserved verbatim. Retain it.

## Modifications

No files have been modified from their provided-source form.

## Sidecars

No sidecar files are required for assets in this directory at this time.
