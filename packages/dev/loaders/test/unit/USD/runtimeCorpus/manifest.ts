export interface IRuntimeCorpusEntry {
    readonly fileName: string;
    readonly description: string;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly sidecars: readonly string[];
    readonly defaultPrim: string;
    readonly upAxis: "Y" | "Z";
    readonly metersPerUnit: number;
}

// Source snapshot: provided-source-shapes-v1 (2026-07-30)
export const BoxAsset: IRuntimeCorpusEntry = {
    fileName: "Box.usda",
    description: "Unit cube via implicit UsdGeomCube with authored size",
    sha256: "d182a886584fd2c4d886cc56852280ac9625911fb6d0ec244fc565b8878798a2",
    sizeBytes: 205,
    sidecars: [],
    defaultPrim: "Box",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const PlaneAsset: IRuntimeCorpusEntry = {
    fileName: "Plane.usda",
    description: "Single quad mesh on the XZ plane with constant authored normals",
    sha256: "8ff6aec006b18f5c0a37bc013ade382d87823d935a707ec62f574a641f09e974",
    sizeBytes: 583,
    sidecars: [],
    defaultPrim: "Plane",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const RuntimeCorpusManifest: readonly IRuntimeCorpusEntry[] = [BoxAsset, PlaneAsset] as const;
