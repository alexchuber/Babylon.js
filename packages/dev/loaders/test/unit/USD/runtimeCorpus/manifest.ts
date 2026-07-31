export interface IRuntimeCorpusEntry {
    readonly fileName: string;
    readonly description: string;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly sidecars: readonly string[];
    readonly unreferencedAlternatives?: readonly string[];
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

export const ForkliftAsset: IRuntimeCorpusEntry = {
    fileName: "Forklift.usda",
    description: "USDA wrapper that delegates a textured Forklift OBJ through the optional external-asset handler with authored 0.03 scale",
    sha256: "949e532756cce3801520d206c8ff01aaf401472a6764290b614f89fa525dd07c",
    sizeBytes: 518,
    sidecars: [
        "Forklift/Forklift.obj",
        "Forklift/Forklift.mtl",
        "Forklift/textures/Mat01_BaseColor.png",
        "Forklift/textures/Mat01_Normal.png",
        "Forklift/textures/Mat01_Roughness.png",
    ],
    defaultPrim: "Forklift",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const UR10Asset: IRuntimeCorpusEntry = {
    fileName: "UR10.usda",
    description: "USDA wrapper that delegates the 21-part UR10 OBJ/MTL sidecar pair through the optional external-asset handler with authored 0.0254 scale",
    sha256: "697a524db5868d98ab687684ed7d213e285b07a5401608686b9aa5eb2d2da7ae",
    sizeBytes: 631,
    sidecars: ["UR10/obj_arm.obj", "UR10/obj_arm.mtl"],
    defaultPrim: "UR10",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const ShelvesAsset: IRuntimeCorpusEntry = {
    fileName: "shelves_01.usda",
    description: "USDA wrapper that delegates a self-contained shelving-unit GLB through the optional external-asset handler",
    sha256: "8c5e6a8551c3a8cdd9228b0d207589f4ed8963dfcd07cd9a8bdef530e731807f",
    sizeBytes: 545,
    sidecars: ["shelves_01.glb"],
    defaultPrim: "Shelves",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const PlaneAsset: IRuntimeCorpusEntry = {
    fileName: "Plane.usda",
    description: "Single quad mesh on the XZ plane with constant authored normals",
    sha256: "522122b8bfe845b4fa80bdefb9b2bf108291a5e432879739ce915371bc830923",
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

export const HospitalBedWrapperAsset: IRuntimeCorpusEntry = {
    fileName: "HospitalBedWrapper.usda",
    description:
        "USDA wrapper that delegates the authored Hospital Bed OBJ, MTL, and diffuse/specular/normal texture sidecars through the application-owned external asset handler with authored 0.0254 scale",
    sha256: "68355c920d910f7d41560bec10e228cfabf235f4a1909ad2e4d9cb3d34924a02",
    sizeBytes: 791,
    sidecars: [
        "HospitalBed/Hospital_Bed.obj",
        "HospitalBed/Hospital_Bed.mtl",
        "HospitalBed/textures/HospitalBed_Diffuse.png",
        "HospitalBed/textures/HospitalBed_Specular.png",
        "HospitalBed/textures/HospitalBed_Normal.png",
    ],
    unreferencedAlternatives: ["HospitalBed/textures/HospitalBed_Glossiness.png"],
    defaultPrim: "HospitalBed",
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

export const RobotArmWrapperAsset: IRuntimeCorpusEntry = {
    fileName: "RobotArm.usda",
    description: "USDA wrapper that delegates the authored Robot Arm OBJ, active MTL, and color texture through the optional external-asset handler",
    sha256: "2271e7e1d3c56fa4641d72f156c9c13fb6d473296a2f7e4bb54a987c1ed814ce",
    sizeBytes: 611,
    sidecars: ["RobotArm/industrial_robot_arm.obj", "RobotArm/industrial_robot_arm.mtl", "RobotArm/Robot_Arm_Color.png"],
    unreferencedAlternatives: ["RobotArm/industrial robot arm.mtl"],
    defaultPrim: "RobotArm",
    upAxis: "Y",
    metersPerUnit: 1,
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
    description:
        "Modular room shell via implicit UsdGeomCube (default size=2) with authored display colors and 50% opacity; source comments describe legacy intent but rendered dimensions are governed by USD default size",
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
    description:
        "Eight-step staircase via implicit UsdGeomCube (default size=2) with authored display colors; actual rendered step dimensions are 2.4 × 0.36 × 0.5 and adjacent steps overlap",
    sha256: "64a1426fa181ce3342fffaffcfa8c3fe346a75ba73a07127773e3abbd4571fc7",
    sizeBytes: 3_717,
    sidecars: [],
    defaultPrim: "Stairs",
    upAxis: "Y",
    metersPerUnit: 1,
} as const;

export const SphereAsset: IRuntimeCorpusEntry = {
    fileName: "Sphere.usda",
    description: "Implicit UsdGeomSphere with authored radius = 0.5",
    sha256: "bb63928fb419e0addea97c29c8c3ab6e2e5d62501f56f0c573af17e0dc73ec48",
    sizeBytes: 217,
    sidecars: [],
    defaultPrim: "Sphere",
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
    ForkliftAsset,
    UR10Asset,
    ShelvesAsset,
    HospitalBedAsset,
    HospitalBedWrapperAsset,
    PlaceholderAsset,
    RobotArmAsset,
    RobotArmWrapperAsset,
    RoomAsset,
    SeahorseTextAsset,
    SphereAsset,
    StairsAsset,
] as const;
