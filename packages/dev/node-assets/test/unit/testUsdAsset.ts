import type { IResolvedPrim, IResolvedStage } from "loaders/USD/resolution/resolvedStage";

import { UsdAsset } from "../../src/representations/usdAsset";

function IdentityTransform() {
    return {
        translation: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: [1, 1, 1] as [number, number, number],
    };
}

/**
 * Creates a minimal resolved stage with a single triangle mesh under /World/Mesh0.
 * Suitable for testing blocks that consume a USD_STAGE without needing real parsing.
 */
export function CreateMinimalResolvedStage(): IResolvedStage {
    return {
        metadata: {
            upAxis: "Y",
            metersPerUnit: 1,
            timeCodesPerSecond: 24,
            startTimeCode: 0,
            endTimeCode: 0,
        },
        root: {
            path: "/",
            name: "",
            kind: "transform",
            transform: IdentityTransform(),
            visible: true,
            children: [
                {
                    path: "/World",
                    name: "World",
                    kind: "transform",
                    transform: IdentityTransform(),
                    visible: true,
                    children: [
                        {
                            path: "/World/Mesh0",
                            name: "Mesh0",
                            kind: "mesh",
                            meshIndex: 0,
                            materialBinding: { materialIndex: 0 },
                            transform: IdentityTransform(),
                            visible: true,
                            children: [],
                        },
                    ],
                },
            ],
        },
        meshes: [
            {
                positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                indices: new Uint32Array([0, 1, 2]),
                normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                doubleSided: false,
                orientation: "rightHanded",
                subdivisionScheme: "none",
            },
        ],
        materials: [
            {
                name: "DefaultMat",
                baseColor: [0.8, 0.2, 0.2],
                opacity: 1,
                metallic: 0,
                roughness: 0.5,
                emissiveColor: [0, 0, 0],
                ior: 1.5,
                occlusion: 1,
                clearcoat: 0,
                clearcoatRoughness: 0,
                useSpecularWorkflow: false,
                specularColor: [1, 1, 1],
                textures: {},
            },
        ],
        skeletons: [],
        diagnostics: [],
    };
}

/**
 * Creates a resolved stage with a deeper hierarchy for testing prim navigation:
 * /World
 *   /World/GroupA
 *     /World/GroupA/Mesh0 (mesh, meshIndex: 0)
 *     /World/GroupA/Mesh1 (mesh, meshIndex: 0)
 *   /World/GroupB
 *     /World/GroupB/Light0 (light)
 *   /World/Camera0 (camera)
 */
export function CreateHierarchicalResolvedStage(): IResolvedStage {
    return {
        metadata: {
            upAxis: "Y",
            metersPerUnit: 1,
            timeCodesPerSecond: 24,
            startTimeCode: 0,
            endTimeCode: 0,
        },
        root: {
            path: "/",
            name: "",
            kind: "transform",
            transform: IdentityTransform(),
            visible: true,
            children: [
                {
                    path: "/World",
                    name: "World",
                    kind: "transform",
                    transform: IdentityTransform(),
                    visible: true,
                    children: [
                        {
                            path: "/World/GroupA",
                            name: "GroupA",
                            kind: "transform",
                            transform: IdentityTransform(),
                            visible: true,
                            children: [
                                {
                                    path: "/World/GroupA/Mesh0",
                                    name: "Mesh0",
                                    kind: "mesh",
                                    meshIndex: 0,
                                    materialBinding: { materialIndex: 0 },
                                    transform: IdentityTransform(),
                                    visible: true,
                                    children: [],
                                },
                                {
                                    path: "/World/GroupA/Mesh1",
                                    name: "Mesh1",
                                    kind: "mesh",
                                    meshIndex: 0,
                                    transform: IdentityTransform(),
                                    visible: true,
                                    children: [],
                                },
                            ],
                        },
                        {
                            path: "/World/GroupB",
                            name: "GroupB",
                            kind: "transform",
                            transform: IdentityTransform(),
                            visible: true,
                            children: [
                                {
                                    path: "/World/GroupB/Light0",
                                    name: "Light0",
                                    kind: "light",
                                    light: {
                                        kind: "distant",
                                        color: [1, 1, 1],
                                        intensity: 500,
                                        exposure: 0,
                                    },
                                    transform: IdentityTransform(),
                                    visible: true,
                                    children: [],
                                },
                            ],
                        },
                        {
                            path: "/World/Camera0",
                            name: "Camera0",
                            kind: "camera",
                            camera: {
                                projection: "perspective",
                                focalLength: 50,
                                horizontalAperture: 36,
                                verticalAperture: 24,
                                clippingRange: [0.1, 1000],
                            },
                            transform: IdentityTransform(),
                            visible: true,
                            children: [],
                        },
                    ],
                },
            ],
        },
        meshes: [
            {
                positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                indices: new Uint32Array([0, 1, 2]),
                doubleSided: false,
                orientation: "rightHanded",
                subdivisionScheme: "none",
            },
        ],
        materials: [
            {
                name: "Red",
                baseColor: [1, 0, 0],
                opacity: 1,
                metallic: 0,
                roughness: 0.5,
                emissiveColor: [0, 0, 0],
                ior: 1.5,
                occlusion: 1,
                clearcoat: 0,
                clearcoatRoughness: 0,
                useSpecularWorkflow: false,
                specularColor: [1, 1, 1],
                textures: {},
            },
        ],
        skeletons: [],
        diagnostics: [{ severity: "warning", message: "Test diagnostic", path: "/World" }],
    };
}

/**
 * Creates a UsdAsset wrapping the given resolved stage (or a minimal default).
 * @param stage - The resolved stage to wrap, or undefined for a minimal default.
 * @param identity - The asset identity string.
 * @returns A UsdAsset ready for block tests.
 */
export function CreateTestUsdAsset(stage?: IResolvedStage, identity = "test-usd"): UsdAsset {
    return new UsdAsset(stage ?? CreateMinimalResolvedStage(), {
        identity,
        revision: 0,
        manifest: { format: "usd" },
        overlay: {},
    });
}

/**
 * Finds a prim by absolute path in a resolved stage, for test assertions.
 * @param root - The root prim to search from.
 * @param path - The absolute prim path (e.g. "/World/Mesh0").
 * @returns The prim, or undefined if not found.
 */
export function FindPrim(root: IResolvedPrim, path: string): IResolvedPrim | undefined {
    if (root.path === path) {
        return root;
    }
    for (const child of root.children) {
        const found = FindPrim(child, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}
