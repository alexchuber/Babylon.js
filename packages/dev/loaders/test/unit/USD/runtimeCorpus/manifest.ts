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

export const RobotArmAsset: IRuntimeCorpusEntry = {
    fileName: "RobotArm2/RobotArm.usda",
    description: "Large multi-mesh Z-up centimeter-scale robot arm with MDL-only materials, authored face-varying normals, no UVs",
    sha256: "148c6386bc4a7249acdb0c45c8300ca3b230627f85e6c9296885038d50b01d9d",
    sizeBytes: 25_766_805,
    sidecars: [],
    defaultPrim: "RobotArm",
    upAxis: "Z",
    metersPerUnit: 0.01,
} as const;

export const RuntimeCorpusManifest: readonly IRuntimeCorpusEntry[] = [PlaneAsset, HospitalBedAsset, RobotArmAsset] as const;
