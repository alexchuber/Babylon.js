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

// Source snapshot: provided-source-runtime-corpus-v1 (2026-07-30)
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

export const HospitalBedAsset: IRuntimeCorpusEntry = {
    fileName: "HospitalBed/Hospital_Bed.usda",
    description: "Large polygon mesh with face-varying normals/UVs, PreviewSurface material, and relative diffuse texture",
    sha256: "dd8afae46e2571f3801363e9dc3385ceb075a3122e6ba7f8f3ff66dd2da13e64",
    sizeBytes: 9_418_448,
    sidecars: ["HospitalBed/textures/HospitalBed_Diffuse.png"],
    defaultPrim: "Mesh",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const RoomAsset: IRuntimeCorpusEntry = {
    fileName: "Room.usda",
    description: "Modular room shell with floor, four walls, and a centered door gap — all via implicit UsdGeomCube with display colors and 50% opacity",
    sha256: "e8f466bbfede76a4e8ac6e78ddb663539a7539f0074e8746fb465faa90dbe163",
    sizeBytes: 3_301,
    sidecars: [],
    defaultPrim: "Room",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const StairsAsset: IRuntimeCorpusEntry = {
    fileName: "stairs.usda",
    description: "Eight-step staircase with uniform step dimensions via implicit UsdGeomCube and display colors",
    sha256: "64a1426fa181ce3342fffaffcfa8c3fe346a75ba73a07127773e3abbd4571fc7",
    sizeBytes: 3_717,
    sidecars: [],
    defaultPrim: "Stairs",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const RuntimeCorpusManifest: readonly IRuntimeCorpusEntry[] = [PlaneAsset, BoxAsset, HospitalBedAsset, RoomAsset, StairsAsset] as const;
