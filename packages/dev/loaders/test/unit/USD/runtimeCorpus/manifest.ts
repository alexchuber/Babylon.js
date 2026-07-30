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

export const ConeAsset: IRuntimeCorpusEntry = {
    fileName: "Cone.usda",
    description: "Cone via implicit UsdGeomCone with authored radius, height, and axis",
    sha256: "e613871f2518722667c435dd9aa6dc2f925e8496a36388c2303a5775f01149b7",
    sizeBytes: 272,
    sidecars: [],
    defaultPrim: "Cone",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const DeliveryBoxAsset: IRuntimeCorpusEntry = {
    fileName: "DeliveryBox.usda",
    description: "USDA wrapper that delegates an OBJ/MTL sidecar pair through the optional external-asset handler",
    sha256: "e24af6aa2e1af8f3a500fe3aba8c259ebad025f97a57a800dc8f9645b0cb5994",
    sizeBytes: 525,
    sidecars: ["DeliveryBox/DeliveryBox.obj", "DeliveryBox/DeliveryBox.mtl"],
    defaultPrim: "DeliveryBox",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const DialysisMachineAsset: IRuntimeCorpusEntry = {
    fileName: "DialysisMachine.usda",
    description: "USDA wrapper for dialysis machine OBJ/MTL sidecars via the optional external-asset handler with authored -90° X rotation and 0.02 uniform scale",
    sha256: "1c56f082c5de599e6d7ab83f781c4bf70a9e0594cc8152afe705f691ff30af91",
    sizeBytes: 543,
    sidecars: ["DialysisMachine/DialysisMachine.obj", "DialysisMachine/DialysisMachine.mtl"],
    defaultPrim: "DialysisMachine",
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

export const RobotArmAsset: IRuntimeCorpusEntry = {
    fileName: "RobotArm2/RobotArm.usda",
    description: "Large multi-mesh Z-up centimeter-scale robot arm with MDL-only materials, authored face-varying normals, no UVs",
    sha256: "63ea1085c87e394e70aecec81d866cc349c0b247617f6d41731ad76f5290f7e4",
    sizeBytes: 25_766_794,
    sidecars: [],
    defaultPrim: "RobotArm",
    upAxis: "Z",
    metersPerUnit: 0.01,
} as const;

export const CylinderAsset: IRuntimeCorpusEntry = {
    fileName: "Cylinder.usda",
    description: "Implicit UsdGeomCylinder with authored radius, height, and axis",
    sha256: "5a333b133ae1c90088594135de8336eed63e7a55c93a0eae170c5a9d5d6fa95e",
    sizeBytes: 284,
    sidecars: [],
    defaultPrim: "Cylinder",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const RoomAsset: IRuntimeCorpusEntry = {
    fileName: "Room.usda",
    description: "Modular room shell via implicit UsdGeomCube (default size=2) with authored display colors and 50% opacity; source comments describe legacy intent but rendered dimensions are governed by USD default size",
    sha256: "e8f466bbfede76a4e8ac6e78ddb663539a7539f0074e8746fb465faa90dbe163",
    sizeBytes: 3_301,
    sidecars: [],
    defaultPrim: "Room",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const PlaceholderAsset: IRuntimeCorpusEntry = {
    fileName: "Placeholder.usda",
    description: "Empty container asset with a single named Xform group and no geometry",
    sha256: "bb319d84281cb65685220f338e2f700ab8dfe206d9e44e7859955bda7f25c9d7",
    sizeBytes: 259,
    sidecars: [],
    defaultPrim: "Placeholder",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const StairsAsset: IRuntimeCorpusEntry = {
    fileName: "stairs.usda",
    description: "Eight-step staircase via implicit UsdGeomCube (default size=2) with authored display colors; actual rendered step dimensions are 2.4 × 0.36 × 0.5 and adjacent steps overlap",
    sha256: "64a1426fa181ce3342fffaffcfa8c3fe346a75ba73a07127773e3abbd4571fc7",
    sizeBytes: 3_717,
    sidecars: [],
    defaultPrim: "Stairs",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const SeahorseTextAsset: IRuntimeCorpusEntry = {
    fileName: "seahorse_anim_mtl_variant.usda",
    description: "Placeholder wrapper with a single named Xform group and no geometry (redacted derivative)",
    sha256: "4db81909e2487d3d319b5b573a1e41c5487e226ea342f7fe20bf9bc5adea3f0f",
    sizeBytes: 253,
    sidecars: [],
    defaultPrim: "Seahorse",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const RuntimeCorpusManifest: readonly IRuntimeCorpusEntry[] = [
    PlaneAsset,
    BoxAsset,
    ConeAsset,
    CylinderAsset,
    DeliveryBoxAsset,
    DialysisMachineAsset,
    HospitalBedAsset,
    PlaceholderAsset,
    RobotArmAsset,
    RoomAsset,
    SeahorseTextAsset,
    StairsAsset,
] as const;
