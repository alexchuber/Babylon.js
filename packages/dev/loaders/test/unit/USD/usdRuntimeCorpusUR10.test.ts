import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { VertexBuffer } from "core/Buffers/buffer";
import { Scene } from "core/scene";
import { type TransformNode } from "core/Meshes/transformNode";
import { AssetContainer } from "core/assetContainer";
import { ImportMeshAsync, LoadAssetContainerAsync, type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { Logger } from "core/Misc/logger";
import { Observable } from "core/Misc/observable";
import { type IFileRequest } from "core/Misc/fileRequest";
import { LoadFileError } from "core/Misc/fileTools";
import { Tools } from "core/Misc/tools";
import { MeshBuilder } from "core/Meshes/meshBuilder";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Texture } from "core/Materials/Textures/texture";

import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

import { UR10Asset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

const LOAD_TIMEOUT = 1_200_000;
const EXPECTED_MATERIAL_NAME = "wire_166229229";
const EXPECTED_CLONED_MATERIAL_NAME = `Clone of ${EXPECTED_MATERIAL_NAME}`;
const EXPECTED_DIFFUSE = [0.651, 0.898, 0.898] as const;
const UR10_OBJ_PATH = "UR10/obj_arm.obj";
const UR10_MTL_PATH = "UR10/obj_arm.mtl";
const EXPECTED_RENDERABLE_MESH_NAMES = [
    "Clone of Arm_01",
    "Clone of Arm_02",
    "Clone of Arm_03",
    "Clone of Arm_04",
    "Clone of Arm_05",
    "Clone of Arm_06",
    "Clone of Arm_07",
    "Clone of Arm_08",
    "Clone of Arm_08",
    "Clone of Arm_09",
    "Clone of Arm_10",
    "Clone of Arm_11",
    "Clone of Arm_12",
    "Clone of Arm_13",
    "Clone of Arm_14",
    "Clone of Arm_15",
    "Clone of Arm_16",
    "Clone of Arm_17",
    "Clone of Arm_18",
    "Clone of Arm_19",
    "Clone of Arm_20",
] as const;

const MINIMAL_OBJ = `mtllib obj_arm.mtl
o Arm
g Arm
usemtl ${EXPECTED_MATERIAL_NAME}
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1
`;

const MINIMAL_OBJ_WITHOUT_NORMALS = `mtllib obj_arm.mtl
o Arm
g Arm
usemtl ${EXPECTED_MATERIAL_NAME}
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
`;

interface IExpectedObjOutput {
    readonly totalMeshes: number;
    readonly renderableMeshes: number;
    readonly vertices: number;
    readonly indices: number;
}

interface IUr10HandlerOptions {
    readonly objData?: string;
    readonly expectedUri?: string;
    readonly expectedOutput?: IExpectedObjOutput;
    readonly requestedUris?: string[];
    readonly onContainer?: (container: AssetContainer) => void;
}

const EXPECTED_UR10_OUTPUT: IExpectedObjOutput = {
    totalMeshes: 42,
    renderableMeshes: 21,
    vertices: 31_655,
    indices: 145_764,
};

const EXPECTED_MINIMAL_OUTPUT: IExpectedObjOutput = {
    totalMeshes: 2,
    renderableMeshes: 1,
    vertices: 3,
    indices: 3,
};

function rejectContainer(container: AssetContainer, message: string): never {
    container.dispose();
    throw new Error(message);
}

function createUr10Handler(options: IUr10HandlerOptions): (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult> {
    const expectedOutput = options.expectedOutput ?? EXPECTED_UR10_OUTPUT;

    return async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
        if (request.propertyName !== "assetInfo:source") {
            return { handled: false };
        }
        if (!request.authoredUri.toLowerCase().endsWith(".obj")) {
            return { handled: false };
        }

        options.requestedUris?.push(request.authoredUri);
        if (options.expectedUri !== undefined && request.authoredUri !== options.expectedUri) {
            throw new Error(`Unexpected OBJ sidecar path: ${request.authoredUri}`);
        }
        if (options.objData === undefined) {
            throw new Error(`OBJ sidecar not found: ${request.authoredUri}`);
        }

        const container = await LoadAssetContainerAsync("data:" + options.objData, request.scene, {
            pluginExtension: ".obj",
            rootUrl: "",
        });
        options.onContainer?.(container);

        const renderableMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        if (renderableMeshes.length === 0) {
            return rejectContainer(container, "OBJ produced no renderable geometry");
        }
        if (container.meshes.length !== expectedOutput.totalMeshes) {
            return rejectContainer(container, `OBJ produced ${container.meshes.length} meshes; expected ${expectedOutput.totalMeshes}`);
        }
        if (renderableMeshes.length !== expectedOutput.renderableMeshes) {
            return rejectContainer(container, `OBJ produced ${renderableMeshes.length} renderable meshes; expected ${expectedOutput.renderableMeshes}`);
        }

        const totalVertices = renderableMeshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
        const totalIndices = renderableMeshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0);
        if (totalVertices !== expectedOutput.vertices || totalIndices !== expectedOutput.indices) {
            return rejectContainer(container, `OBJ geometry is degraded: ${totalVertices} vertices and ${totalIndices} indices`);
        }

        if (container.materials.length !== 1) {
            return rejectContainer(container, `OBJ material output is degraded: expected 1 material, got ${container.materials.length}`);
        }

        const material = renderableMeshes[0].material;
        if (!(material instanceof StandardMaterial) || material.name !== EXPECTED_MATERIAL_NAME) {
            return rejectContainer(container, "OBJ material output is degraded: expected the authored UR10 material");
        }
        if (
            Math.abs(material.diffuseColor.r - EXPECTED_DIFFUSE[0]) > 0.001 ||
            Math.abs(material.diffuseColor.g - EXPECTED_DIFFUSE[1]) > 0.001 ||
            Math.abs(material.diffuseColor.b - EXPECTED_DIFFUSE[2]) > 0.001
        ) {
            return rejectContainer(container, "OBJ material output is degraded: representative MTL diffuse values changed");
        }

        return { handled: true, container };
    };
}

function mockMtlLoadFile(requestedUrls: string[], response: string | Error): void {
    vi.spyOn(Tools, "LoadFile").mockImplementation((url, onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
        const fileRequest: IFileRequest = {
            abort: () => {},
            onCompleteObservable: new Observable<IFileRequest>(),
        };
        requestedUrls.push(url);
        setTimeout(() => {
            if (!url.endsWith(".mtl")) {
                onError?.(undefined, new LoadFileError(`Unexpected sidecar request: ${url}`, undefined));
            } else if (response instanceof Error) {
                onError?.(undefined, new LoadFileError(response.message, undefined));
            } else {
                onSuccess(response);
            }
        }, 0);
        return fileRequest;
    });
}

function createSyntheticUsda(assetPath: string): string {
    return `#usda 1.0
(
    defaultPrim = "UR10"
    metersPerUnit = 1
    upAxis = "Y"
)
def Xform "UR10"
{
    def Xform "Arm" (
        kind = "reference"
    )
    {
        custom asset assetInfo:source = @${assetPath}@
        double3 xformOp:translate = (0, 0, 0)
        float3 xformOp:rotateXYZ = (0, 0, 0)
        float3 xformOp:scale = (0.0254, 0.0254, 0.0254)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]
    }
}`;
}

function expectIdentityTransform(node: TransformNode): void {
    expect(node.position.asArray()).toEqual([0, 0, 0]);
    expect(node.scaling.asArray()).toEqual([1, 1, 1]);
    expect(node.rotationQuaternion).toBeDefined();
    expect(node.rotationQuaternion!.x).toBeCloseTo(0, 6);
    expect(node.rotationQuaternion!.y).toBeCloseTo(0, 6);
    expect(node.rotationQuaternion!.z).toBeCloseTo(0, 6);
    expect(Math.abs(node.rotationQuaternion!.w)).toBeCloseTo(1, 6);
}

describe("USD RuntimeCorpus - UR10", () => {
    let sharedEngine: NullEngine;
    let sharedScene: Scene;
    let sharedResult: ISceneLoaderAsyncResult;
    let handlerRequestedUris: string[];
    let toolsLoadFileUrls: string[];

    beforeAll(async () => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
        handlerRequestedUris = [];
        toolsLoadFileUrls = [];
        mockMtlLoadFile(toolsLoadFileUrls, readRuntimeCorpusText(UR10_MTL_PATH));

        sharedEngine = new NullEngine();
        sharedScene = new Scene(sharedEngine);
        sharedScene.useRightHandedSystem = true;
        const handler = createUr10Handler({
            objData: readRuntimeCorpusText(UR10_OBJ_PATH),
            expectedUri: "./UR10/obj_arm.obj",
            requestedUris: handlerRequestedUris,
        });
        sharedResult = await ImportMeshAsync("data:" + readRuntimeCorpusText(UR10Asset.fileName), sharedScene, {
            pluginExtension: ".usda",
            pluginOptions: { usd: { externalAssetHandler: handler } },
        });
    }, LOAD_TIMEOUT);

    afterAll(() => {
        sharedScene?.dispose();
        sharedEngine?.dispose();
        vi.restoreAllMocks();
    });

    it("preserves the authored UR10 hierarchy and full transform", () => {
        const stageRoot = sharedResult.transformNodes.find((node) => node.name === "__usd_root__");
        const ur10 = sharedResult.transformNodes.find((node) => node.name === "UR10");
        const arm = sharedResult.transformNodes.find((node) => node.name === "Arm");

        expect(stageRoot).toBeDefined();
        expect(ur10).toBeDefined();
        expect(arm).toBeDefined();
        expect(stageRoot!.parent).toBeNull();
        expect(ur10!.parent).toBe(stageRoot);
        expect(arm!.parent).toBe(ur10);
        expectIdentityTransform(stageRoot!);
        expectIdentityTransform(ur10!);
        expect(arm!.position.asArray()).toEqual([0, 0, 0]);
        expect(arm!.rotationQuaternion).toBeDefined();
        expect(arm!.rotationQuaternion!.x).toBeCloseTo(0, 6);
        expect(arm!.rotationQuaternion!.y).toBeCloseTo(0, 6);
        expect(arm!.rotationQuaternion!.z).toBeCloseTo(0, 6);
        expect(Math.abs(arm!.rotationQuaternion!.w)).toBeCloseTo(1, 6);
        expect(arm!.scaling.asArray()).toEqual([0.0254, 0.0254, 0.0254]);
    });

    it("loads the exact OBJ hierarchy, mesh names, vertex count, and index count", () => {
        expect(sharedResult.meshes).toHaveLength(EXPECTED_UR10_OUTPUT.totalMeshes);

        const renderableMeshes = sharedResult.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(EXPECTED_UR10_OUTPUT.renderableMeshes);
        expect(renderableMeshes.map((mesh) => mesh.name).sort()).toEqual([...EXPECTED_RENDERABLE_MESH_NAMES].sort());
        expect(sharedResult.meshes.filter((mesh) => mesh.getTotalVertices() === 0)).toHaveLength(21);

        let totalVertices = 0;
        let totalIndices = 0;
        for (const mesh of renderableMeshes) {
            totalVertices += mesh.getTotalVertices();
            totalIndices += mesh.getTotalIndices();
            expect(mesh.parent?.name).toBe(mesh.name);
            expect(mesh.parent?.parent?.name).toBe("Arm");
        }
        expect(totalVertices).toBe(EXPECTED_UR10_OUTPUT.vertices);
        expect(totalIndices).toBe(EXPECTED_UR10_OUTPUT.indices);
    });

    it("provides finite non-zero normals on every renderable mesh", () => {
        const renderableMeshes = sharedResult.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        for (const mesh of renderableMeshes) {
            const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
            expect(normals).toBeDefined();
            expect(normals).toHaveLength(mesh.getTotalVertices() * 3);
            for (const offset of [0, normals!.length - 3]) {
                const x = normals![offset];
                const y = normals![offset + 1];
                const z = normals![offset + 2];
                expect(Number.isFinite(x)).toBe(true);
                expect(Number.isFinite(y)).toBe(true);
                expect(Number.isFinite(z)).toBe(true);
                expect(Math.hypot(x, y, z)).toBeGreaterThan(0);
            }
        }
    });

    it("preserves the authored MTL material name and representative values", () => {
        const renderableMeshes = sharedResult.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        const materialNames = new Set(renderableMeshes.map((mesh) => mesh.material?.name));
        expect(materialNames).toEqual(new Set([EXPECTED_CLONED_MATERIAL_NAME]));

        const material = renderableMeshes[0].material;
        expect(material).toBeInstanceOf(StandardMaterial);
        const standardMaterial = material as StandardMaterial;
        expect(standardMaterial.diffuseColor.r).toBeCloseTo(EXPECTED_DIFFUSE[0], 3);
        expect(standardMaterial.diffuseColor.g).toBeCloseTo(EXPECTED_DIFFUSE[1], 3);
        expect(standardMaterial.diffuseColor.b).toBeCloseTo(EXPECTED_DIFFUSE[2], 3);
        expect(standardMaterial.specularColor.r).toBeCloseTo(0.35, 3);
        expect(standardMaterial.specularColor.g).toBeCloseTo(0.35, 3);
        expect(standardMaterial.specularColor.b).toBeCloseTo(0.35, 3);
        expect(standardMaterial.specularPower).toBeCloseTo(32, 0);
    });

    it("produces exact aggregate world bounds after computeWorldMatrix", () => {
        const renderableMeshes = sharedResult.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (const mesh of renderableMeshes) {
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo(false, false);
            const bounds = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bounds.minimumWorld.x);
            minY = Math.min(minY, bounds.minimumWorld.y);
            minZ = Math.min(minZ, bounds.minimumWorld.z);
            maxX = Math.max(maxX, bounds.maximumWorld.x);
            maxY = Math.max(maxY, bounds.maximumWorld.y);
            maxZ = Math.max(maxZ, bounds.maximumWorld.z);
        }

        expect(minX).toBeCloseTo(-0.65512442, 6);
        expect(minY).toBeCloseTo(-0.00252222, 6);
        expect(minZ).toBeCloseTo(0.5403977, 6);
        expect(maxX).toBeCloseTo(-0.41729914, 6);
        expect(maxY).toBeCloseTo(0.7166864, 6);
        expect(maxZ).toBeCloseTo(0.66098674, 6);
    });

    it("requests exactly the authored OBJ and MTL sidecars", () => {
        expect(handlerRequestedUris).toEqual(["./UR10/obj_arm.obj"]);
        expect(toolsLoadFileUrls).toEqual(["obj_arm.mtl"]);
        expect(handlerRequestedUris.some((uri) => /\.(?:glb|usdc|usd)$/i.test(uri))).toBe(false);
        expect(toolsLoadFileUrls.some((uri) => /\.(?:glb|usdc|usd|obj)$/i.test(uri))).toBe(false);
    });
});

describe("USD RuntimeCorpus - UR10 AssetContainer ownership", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it(
        "owns exact nonempty categories and restores every scene baseline after add, remove, and dispose",
        async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            const baselineMesh = MeshBuilder.CreateBox("baseline", { size: 1 }, scene);
            const baselineMaterial = new StandardMaterial("baseline-material", scene);
            const baselineTexture = new Texture(null, scene);
            baselineMaterial.diffuseTexture = baselineTexture;
            baselineMesh.material = baselineMaterial;
            const baselineCounts = {
                meshes: scene.meshes.length,
                transformNodes: scene.transformNodes.length,
                materials: scene.materials.length,
                geometries: scene.geometries.length,
                textures: scene.textures.length,
            };
            const toolsLoadFileUrls: string[] = [];
            mockMtlLoadFile(toolsLoadFileUrls, readRuntimeCorpusText(UR10_MTL_PATH));

            try {
                // The shared corpus load covers full geometry; this ownership pass uses a tiny injected
                // sidecar so container lifecycle assertions do not reparse the 3.5 MB OBJ.
                const handler = createUr10Handler({
                    objData: MINIMAL_OBJ,
                    expectedUri: "./UR10/obj_arm.obj",
                    expectedOutput: EXPECTED_MINIMAL_OUTPUT,
                });
                const container = await LoadAssetContainerAsync("data:" + createSyntheticUsda("./UR10/obj_arm.obj"), scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: handler } },
                });

                expect(container.meshes).toHaveLength(2);
                expect(container.transformNodes).toHaveLength(3);
                expect(container.materials).toHaveLength(1);
                expect(container.geometries).toHaveLength(1);
                expect(container.textures).toHaveLength(0);
                expect(container.multiMaterials).toHaveLength(0);
                expect(container.cameras).toHaveLength(0);
                expect(container.lights).toHaveLength(0);
                expect(container.skeletons).toHaveLength(0);
                expect(container.animationGroups).toHaveLength(0);
                expect(toolsLoadFileUrls).toEqual(["obj_arm.mtl"]);

                expect(scene.meshes).toHaveLength(baselineCounts.meshes);
                expect(scene.transformNodes).toHaveLength(baselineCounts.transformNodes);
                expect(scene.materials).toHaveLength(baselineCounts.materials);
                expect(scene.geometries).toHaveLength(baselineCounts.geometries);
                expect(scene.textures).toHaveLength(baselineCounts.textures);

                container.addAllToScene();
                expect(scene.meshes).toHaveLength(baselineCounts.meshes + container.meshes.length);
                expect(scene.transformNodes).toHaveLength(baselineCounts.transformNodes + container.transformNodes.length);
                expect(scene.materials).toHaveLength(baselineCounts.materials + container.materials.length);
                expect(scene.geometries).toHaveLength(baselineCounts.geometries + container.geometries.length);
                expect(scene.textures).toHaveLength(baselineCounts.textures);

                container.removeAllFromScene();
                expect(scene.meshes).toHaveLength(baselineCounts.meshes);
                expect(scene.transformNodes).toHaveLength(baselineCounts.transformNodes);
                expect(scene.materials).toHaveLength(baselineCounts.materials);
                expect(scene.geometries).toHaveLength(baselineCounts.geometries);
                expect(scene.textures).toHaveLength(baselineCounts.textures);

                container.dispose();
                expect(container.meshes).toHaveLength(0);
                expect(container.transformNodes).toHaveLength(0);
                expect(container.materials).toHaveLength(0);
                expect(container.geometries).toHaveLength(0);
                expect(container.textures).toHaveLength(0);
                expect(scene.meshes).toHaveLength(baselineCounts.meshes);
                expect(scene.transformNodes).toHaveLength(baselineCounts.transformNodes);
                expect(scene.materials).toHaveLength(baselineCounts.materials);
                expect(scene.geometries).toHaveLength(baselineCounts.geometries);
                expect(scene.textures).toHaveLength(baselineCounts.textures);
            } finally {
                scene.dispose();
                engine.dispose();
            }
        },
        LOAD_TIMEOUT
    );
});

describe("USD RuntimeCorpus - UR10 sidecar failures and diagnostics", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects a missing OBJ through outer module-level ImportMeshAsync", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const requestedUris: string[] = [];
        try {
            const handler = createUr10Handler({
                expectedUri: "./UR10/missing.obj",
                requestedUris,
            });
            await expect(
                ImportMeshAsync("data:" + createSyntheticUsda("./UR10/missing.obj"), scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: handler } },
                })
            ).rejects.toThrow("OBJ sidecar not found");
            expect(requestedUris.length).toBeGreaterThan(0);
            expect(requestedUris.every((uri) => uri === "./UR10/missing.obj")).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("computes normals for an injected OBJ that omits authored normals", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const toolsLoadFileUrls: string[] = [];
        mockMtlLoadFile(toolsLoadFileUrls, readRuntimeCorpusText(UR10_MTL_PATH));
        try {
            const handler = createUr10Handler({
                objData: MINIMAL_OBJ_WITHOUT_NORMALS,
                expectedUri: "./UR10/obj_arm.obj",
                expectedOutput: EXPECTED_MINIMAL_OUTPUT,
            });
            const result = await ImportMeshAsync("data:" + createSyntheticUsda("./UR10/obj_arm.obj"), scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: handler } },
            });
            const mesh = result.meshes.find((candidate) => candidate.getTotalVertices() > 0);
            const normals = mesh?.getVerticesData(VertexBuffer.NormalKind);
            expect(normals).toHaveLength(9);
            expect(Math.hypot(normals![0], normals![1], normals![2])).toBeCloseTo(1, 6);
            expect(toolsLoadFileUrls).toEqual(["obj_arm.mtl"]);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects malformed OBJ output and disposes the temporary container", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        let temporaryContainer: AssetContainer | undefined;
        try {
            const handler = createUr10Handler({
                objData: "not a valid OBJ\n!@#$%^&*()",
                expectedUri: "./UR10/obj_arm.obj",
                onContainer: (container) => {
                    temporaryContainer = container;
                },
            });
            await expect(
                ImportMeshAsync("data:" + createSyntheticUsda("./UR10/obj_arm.obj"), scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: handler } },
                })
            ).rejects.toThrow("OBJ produced no renderable geometry");
            expect(temporaryContainer).toBeDefined();
            expect(temporaryContainer!.meshes).toHaveLength(0);
            expect(temporaryContainer!.materials).toHaveLength(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects a missing MTL through outer module-level ImportMeshAsync", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const toolsLoadFileUrls: string[] = [];
        mockMtlLoadFile(toolsLoadFileUrls, new Error("MTL sidecar missing"));
        try {
            const handler = createUr10Handler({
                objData: MINIMAL_OBJ,
                expectedUri: "./UR10/obj_arm.obj",
                expectedOutput: EXPECTED_MINIMAL_OUTPUT,
            });
            await expect(
                ImportMeshAsync("data:" + createSyntheticUsda("./UR10/obj_arm.obj"), scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: handler } },
                })
            ).rejects.toThrow("expected 1 material");
            expect(toolsLoadFileUrls).toEqual(["obj_arm.mtl"]);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects malformed MTL values through outer module-level ImportMeshAsync", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const toolsLoadFileUrls: string[] = [];
        mockMtlLoadFile(toolsLoadFileUrls, "this is not valid MTL data\n!@#$%^&*()");
        try {
            const handler = createUr10Handler({
                objData: MINIMAL_OBJ,
                expectedUri: "./UR10/obj_arm.obj",
                expectedOutput: EXPECTED_MINIMAL_OUTPUT,
            });
            await expect(
                ImportMeshAsync("data:" + createSyntheticUsda("./UR10/obj_arm.obj"), scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: handler } },
                })
            ).rejects.toThrow("expected 1 material");
            expect(toolsLoadFileUrls).toEqual(["obj_arm.mtl"]);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("logs the strict no-handler diagnostic with the exact prim/property path", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const logCalls: string[] = [];
        vi.mocked(Logger.Log).mockImplementation((message) => {
            logCalls.push(typeof message === "string" ? message : message.map(String).join(" "));
        });
        try {
            const result = await ImportMeshAsync("data:" + readRuntimeCorpusText(UR10Asset.fileName), scene, {
                pluginExtension: ".usda",
            });
            expect(result.meshes).toHaveLength(0);
            const diagnostic = logCalls.find((message) => message.includes("assetInfo:source") && message.includes("no external asset handler"));
            expect(diagnostic).toBeDefined();
            expect(diagnostic).toContain("/UR10/Arm.assetInfo:source");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
