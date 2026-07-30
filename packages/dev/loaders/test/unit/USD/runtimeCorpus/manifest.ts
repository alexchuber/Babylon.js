/**
 * Typed manifest of RuntimeCorpus assets available for USD loader integration tests.
 *
 * Each entry describes a single USDA file copied from a provided-source snapshot of
 * representative USD shapes and assets. The snapshot is pinned for reproducibility;
 * re-pin intentionally.
 *
 * All hashes are SHA-256 over the original, byte-preserved fixture file.
 */

/** Descriptor for a single corpus asset. */
export interface IRuntimeCorpusEntry {
    /** Filename relative to the RuntimeCorpus root (e.g. `"Plane.usda"`). */
    readonly fileName: string;
    /** Short human-readable description for test diagnostics. */
    readonly description: string;
    /** SHA-256 hex digest of the original fixture bytes. */
    readonly sha256: string;
    /** File size in bytes. */
    readonly sizeBytes: number;
    /** Required sidecar filenames that must accompany this asset (empty when none). */
    readonly sidecars: readonly string[];
    /** Expected default prim name authored in the layer metadata. */
    readonly defaultPrim: string;
    /** Authored `upAxis` (`"Y"` or `"Z"`). */
    readonly upAxis: "Y" | "Z";
    /** Authored `metersPerUnit`. */
    readonly metersPerUnit: number;
}

/**
 * Pinned corpus manifest.
 *
 * Source snapshot: `provided-source-shapes-v1` (2026-07-30).
 */
export const RuntimeCorpusManifest: readonly IRuntimeCorpusEntry[] = [
    {
        fileName: "Plane.usda",
        description: "Single quad mesh on the XZ plane with constant authored normals",
        sha256: "8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974",
        sizeBytes: 583,
        sidecars: [],
        defaultPrim: "Plane",
        upAxis: "Y",
        metersPerUnit: 1,
    },
] as const;
