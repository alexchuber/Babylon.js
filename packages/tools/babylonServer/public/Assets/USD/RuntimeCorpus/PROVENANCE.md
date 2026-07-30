# RuntimeCorpus Provenance

USD loader corpus — pinned test fixtures for the Babylon.js USD scene loader.

> **TODO — Licensing verification**: Redistribution permission for these assets
> has not been formally verified. Confirm licensing terms before shipping in a
> release build or distributing outside this test corpus.

## Snapshot

These files were copied from a provided source snapshot and are used exclusively
as deterministic test fixtures for the Babylon.js USD loader.

## Assets

### DeliveryBox

A USDA wrapper referencing an OBJ/MTL sidecar pair via a custom `assetInfo:source`
property. Tests the external-asset handler through the public SceneLoader interface.

| File | Size (bytes) | SHA-256 |
|------|-------------|---------|
| `DeliveryBox.usda` | 525 | `e24af6aa2e1af8f3a500fe3aba8c259ebad025f97a57a800dc8f9645b0cb5994` |
| `DeliveryBox/DeliveryBox.obj` | 13704 | `a807116330157780ea20a3a44ae36bcd8d9806ca18c96dab013e685d3bc1364a` |
| `DeliveryBox/DeliveryBox.mtl` | 208 | `84fefbdd1c6b4338cbea17ffda4ea6c70142b3af4084e6473b9d1439325a5060` |

**Sidecar graph**: `DeliveryBox.usda` → `./DeliveryBox/DeliveryBox.obj` → `DeliveryBox.mtl`

**Embedded attribution**: OBJ header contains `# Blender 4.5.3 LTS` / `# www.blender.org`.

**Stage metadata**: `metersPerUnit = 1`, `upAxis = "Y"`, `defaultPrim = "DeliveryBox"`.
