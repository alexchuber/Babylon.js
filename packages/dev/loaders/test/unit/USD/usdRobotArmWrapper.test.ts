import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { VertexBuffer } from "core/Buffers/buffer";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { type AssetContainer } from "core/assetContainer";
import { type ISceneLoaderAsyncResult, ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { Logger } from "core/Misc/logger";
import { Observable } from "core/Misc/observable";
import { type IFileRequest } from "core/Misc/fileRequest";
import { type IOfflineProvider } from "core/Offline/IOfflineProvider";
import { type WebRequest } from "core/Misc/webRequest";
import { LoadFileError } from "core/Misc/fileTools";
import { Tools } from "core/Misc/tools";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

import { readRuntimeCorpusBytes, readRuntimeCorpusText, RobotArmWrapperAsset } from "./runtimeCorpus";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));
const expectedTextureName = "Robot_Arm_Color.png";
const expectedMaterialName = "Robot_arm";
const authoredMeshNames = ["robot_arm_base", "Robot_arm_2", "robot_arm_large", "robot_arm", "robot_arm_end", "Grabber", "Grabber_hand_1", "Grabber_hand_2"];
const expectedMeshNames = authoredMeshNames.map((name) => "Clone of " + name);
const expectedVertexCounts = [6102, 16945, 28259, 14161, 5485, 2115, 1934, 1934];
const expectedIndexCounts = [26850, 44172, 86844, 40548, 14718, 7104, 6408, 6408];
const minimalObjData = `mtllib industrial_robot_arm.mtl
o robot_arm_base
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl Robot_arm
f 1/1/1 2/2/1 3/3/1`;

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

function replaceAuthoredObjPath(usda: string, objPath: string): string {
    return usda.replace("./RobotArm/industrial_robot_arm.obj", objPath);
}

function assertCondition(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function validatePng(bytes: Buffer, label: string): void {
    assertCondition(bytes.length >= 33, `${label} is too small to be a PNG`);
    assertCondition(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${label} has an invalid PNG signature`);
    assertCondition(bytes.toString("ascii", 12, 16) === "IHDR", `${label} is missing a PNG IHDR chunk`);
    assertCondition(bytes.readUInt32BE(16) === 4096 && bytes.readUInt32BE(20) === 4096, `${label} has unexpected dimensions`);
    assertCondition(bytes[24] === 8 && bytes[25] === 2, `${label} is not an 8-bit RGB PNG`);
}

type IRobotArmHandlerOptions = {
    readonly objData?: string;
    readonly expectedMeshCount?: number;
    readonly readTextureBytes?: (textureName: string) => Buffer;
};

describe("USD RuntimeCorpus - Robot Arm OBJ wrapper", () => {
    let engine: NullEngine;
    let scene: Scene;
    let result: ISceneLoaderAsyncResult;
    let successfulRequestGraph: string[];
    let successfulUnexpectedFileRequests: string[];
    let mtlDataOverride: string | undefined;
    let mtlLoadError: Error | undefined;
    const logMessages: string[] = [];
    const requestGraph: string[] = [];
    const unexpectedFileRequests: string[] = [];

    function createRobotArmHandler(options: IRobotArmHandlerOptions = {}): (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult> {
        return async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }

            requestGraph.push(`USD:${request.authoredUri}`);
            const objRelativePath = request.authoredUri.replace(/^\.\//, "");
            const objFilePath = path.join(corpusRoot, objRelativePath);
            if (!options.objData && !fs.existsSync(objFilePath)) {
                throw new Error(`OBJ sidecar not found at authored path: ${request.authoredUri}`);
            }

            const objData = options.objData ?? fs.readFileSync(objFilePath, "utf8");
            let container: AssetContainer | undefined;
            try {
                container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
                    pluginExtension: ".obj",
                    rootUrl: "",
                    pluginOptions: {
                        obj: {
                            computeNormals: true,
                            materialLoadingFailsSilently: false,
                            optimizeWithUV: true,
                        },
                    },
                });

                const geometryMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
                const expectedMeshCount = options.expectedMeshCount ?? expectedMeshNames.length;
                assertCondition(geometryMeshes.length === expectedMeshCount, `Expected ${expectedMeshCount} Robot Arm meshes, got ${geometryMeshes.length}`);
                if (expectedMeshCount === expectedMeshNames.length) {
                    assertCondition(
                        JSON.stringify(geometryMeshes.map((mesh) => mesh.name)) === JSON.stringify(authoredMeshNames),
                        "OBJ mesh names did not match the authored source"
                    );
                }

                const materialNames = new Set<string>();
                for (const mesh of geometryMeshes) {
                    if (mesh.material) {
                        materialNames.add(mesh.material.name);
                    }
                }
                assertCondition(materialNames.size === 1 && materialNames.has(expectedMaterialName), "Active MTL did not produce the expected Robot_arm material");

                const textures = container.textures;
                assertCondition(textures.length === 1, "Active MTL did not produce exactly one color texture");
                assertCondition(textures[0].name === expectedTextureName, `Expected color texture ${expectedTextureName}, got ${textures[0].name}`);
                requestGraph.push(`Texture:${textures[0].name}`);
                const textureBytes = (options.readTextureBytes ?? ((textureName) => readRuntimeCorpusBytes(`RobotArm/${textureName}`)))(textures[0].name);
                validatePng(textureBytes, textures[0].name);

                return { handled: true, container };
            } catch (error) {
                container?.dispose();
                throw error;
            }
        };
    }

    beforeAll(async () => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();

        vi.spyOn(Logger, "Log").mockImplementation((message: string) => {
            logMessages.push(message);
        });
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
        vi.spyOn(Tools, "LoadFile").mockImplementation(
            (
                fileOrUrl: File | string,
                onSuccess: (data: string | ArrayBuffer, responseURL?: string, contentType?: string | null) => void,
                _onProgress?: (ev: ProgressEvent) => void,
                _offlineProvider?: IOfflineProvider | null,
                _useArrayBuffer?: boolean,
                onError?: (request?: WebRequest, exception?: LoadFileError) => void
            ): IFileRequest => {
                const fileRequest: IFileRequest = {
                    abort: () => {},
                    onCompleteObservable: new Observable<IFileRequest>(),
                };
                const url = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
                if (url.endsWith("industrial_robot_arm.mtl")) {
                    requestGraph.push(`MTL:${url}`);
                    if (mtlLoadError) {
                        setTimeout(() => onError?.(undefined, new LoadFileError(mtlLoadError!.message, undefined)), 0);
                    } else {
                        setTimeout(() => onSuccess(mtlDataOverride ?? readCorpusFile("RobotArm/industrial_robot_arm.mtl")), 0);
                    }
                } else {
                    unexpectedFileRequests.push(url);
                    setTimeout(() => onError?.(undefined, new LoadFileError(`Unexpected file request: ${url}`, undefined)), 0);
                }
                return fileRequest;
            }
        );

        engine = new NullEngine();
        scene = new Scene(engine);
        result = await ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), scene, {
            pluginExtension: ".usda",
            name: RobotArmWrapperAsset.fileName,
            pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler() } },
        });
        successfulRequestGraph = [...requestGraph];
        successfulUnexpectedFileRequests = [...unexpectedFileRequests];
    }, 600_000);

    beforeEach(() => {
        mtlDataOverride = undefined;
        mtlLoadError = undefined;
    });

    afterAll(() => {
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    it("creates the authored RobotArm -> Asset hierarchy and full identity transform", () => {
        const rootNode = result.transformNodes.find((node) => node.name === "RobotArm");
        const assetNode = result.transformNodes.find((node) => node.name === "Asset");
        expect(rootNode).toBeDefined();
        expect(assetNode).toBeDefined();
        expect(assetNode!.parent).toBe(rootNode);

        for (const node of [rootNode!, assetNode!]) {
            expect(node.position.x).toBeCloseTo(0, 6);
            expect(node.position.y).toBeCloseTo(0, 6);
            expect(node.position.z).toBeCloseTo(0, 6);
            expect(node.rotationQuaternion).toBeDefined();
            expect(node.rotationQuaternion!.x).toBeCloseTo(0, 6);
            expect(node.rotationQuaternion!.y).toBeCloseTo(0, 6);
            expect(node.rotationQuaternion!.z).toBeCloseTo(0, 6);
            expect(node.rotationQuaternion!.w).toBeCloseTo(1, 6);
            expect(node.scaling.x).toBeCloseTo(1, 6);
            expect(node.scaling.y).toBeCloseTo(1, 6);
            expect(node.scaling.z).toBeCloseTo(1, 6);
        }
    });

    it("loads the exact eight cloned OBJ meshes with authored names, vertices, and indices", () => {
        const geometryMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        expect(result.meshes).toHaveLength(expectedMeshNames.length);
        expect(geometryMeshes.map((mesh) => mesh.name)).toEqual(expectedMeshNames);
        expect(geometryMeshes.map((mesh) => mesh.getTotalVertices())).toEqual(expectedVertexCounts);
        expect(geometryMeshes.map((mesh) => mesh.getTotalIndices())).toEqual(expectedIndexCounts);

        const assetNode = result.transformNodes.find((node) => node.name === "Asset")!;
        for (const mesh of geometryMeshes) {
            expect(mesh.parent).toBe(assetNode);
        }
    });

    it("has computed finite normals for every imported OBJ mesh", () => {
        for (const mesh of result.meshes) {
            const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
            expect(normals).toBeDefined();
            expect(normals).toHaveLength(mesh.getTotalVertices() * 3);
            for (let index = 0; index < Math.min(normals!.length, 30); index += 3) {
                const x = normals![index];
                const y = normals![index + 1];
                const z = normals![index + 2];
                expect(Number.isFinite(x)).toBe(true);
                expect(Number.isFinite(y)).toBe(true);
                expect(Number.isFinite(z)).toBe(true);
                expect(Math.hypot(x, y, z)).toBeCloseTo(1, 3);
            }
        }
    });

    it("assigns one cloned StandardMaterial and one ready diffuse color texture", () => {
        const geometryMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        expect(new Set(geometryMeshes.map((mesh) => mesh.material?.name))).toEqual(new Set(["Clone of Robot_arm"]));
        const material = geometryMeshes[0].material;
        expect(material).toBeInstanceOf(StandardMaterial);
        const standardMaterial = material as StandardMaterial;
        expect(standardMaterial.specularColor.r).toBeCloseTo(0.5, 6);
        expect(standardMaterial.specularColor.g).toBeCloseTo(0.5, 6);
        expect(standardMaterial.specularColor.b).toBeCloseTo(0.5, 6);
        expect(standardMaterial.alpha).toBeCloseTo(1, 6);
        expect(standardMaterial.diffuseTexture).toBeDefined();
        expect(standardMaterial.getActiveTextures()).toHaveLength(1);

        const texture = standardMaterial.diffuseTexture!;
        expect(texture.name).toBe(expectedTextureName);
        expect(texture.url).toBe(expectedTextureName);
        expect(texture.isReady()).toBe(true);
        expect(texture.getSize().width).toBeGreaterThan(0);
        expect(texture.getSize().height).toBeGreaterThan(0);
        expect(scene.textures).toHaveLength(1);
    });

    it("produces exact aggregate world bounds after computing every mesh world matrix", () => {
        const geometryMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (const mesh of geometryMeshes) {
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo();
            const bounds = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bounds.minimumWorld.x);
            minY = Math.min(minY, bounds.minimumWorld.y);
            minZ = Math.min(minZ, bounds.minimumWorld.z);
            maxX = Math.max(maxX, bounds.maximumWorld.x);
            maxY = Math.max(maxY, bounds.maximumWorld.y);
            maxZ = Math.max(maxZ, bounds.maximumWorld.z);
        }

        expect(minX).toBeCloseTo(-0.646768, 5);
        expect(minY).toBeCloseTo(-0.003181, 5);
        expect(minZ).toBeCloseTo(-0.828978, 5);
        expect(maxX).toBeCloseTo(0.546768, 5);
        expect(maxY).toBeCloseTo(1.772124, 5);
        expect(maxZ).toBeCloseTo(1.136219, 5);
    });

    it("tracks only the authored USD -> OBJ -> active MTL -> color texture graph", () => {
        expect(successfulRequestGraph).toEqual(["USD:./RobotArm/industrial_robot_arm.obj", "MTL:industrial_robot_arm.mtl", "Texture:Robot_Arm_Color.png"]);
        expect(successfulUnexpectedFileRequests).toEqual([]);
        expect(RobotArmWrapperAsset.sidecars).toEqual(["RobotArm/industrial_robot_arm.obj", "RobotArm/industrial_robot_arm.mtl", "RobotArm/Robot_Arm_Color.png"]);
        expect(RobotArmWrapperAsset.sidecars).not.toContain("RobotArm/industrial robot arm.mtl");
        expect(RobotArmWrapperAsset.sidecars.some((sidecar) => /\.(glb|usdc|usd)$/i.test(sidecar))).toBe(false);
        expect(fs.existsSync(path.join(corpusRoot, "RobotArm", "industrial robot arm.mtl"))).toBe(false);

        const objData = readCorpusFile("RobotArm/industrial_robot_arm.obj");
        const mtlData = readCorpusFile("RobotArm/industrial_robot_arm.mtl");
        expect(objData).toContain("mtllib industrial_robot_arm.mtl");
        expect(objData).not.toContain("industrial robot arm.mtl");
        expect(mtlData).toContain("map_Kd Robot_Arm_Color.png");
        expect(mtlData).not.toContain(".glb");
        validatePng(readRuntimeCorpusBytes("RobotArm/Robot_Arm_Color.png"), expectedTextureName);
    });

    it("keeps the USD stage in right-handed mode", () => {
        expect(scene.useRightHandedSystem).toBe(true);
    });

    it("loads every category off-scene and restores all four scene baselines", async () => {
        const ownershipEngine = new NullEngine();
        const ownershipScene = new Scene(ownershipEngine);
        const baseline = {
            meshes: ownershipScene.meshes.length,
            materials: ownershipScene.materials.length,
            geometries: ownershipScene.geometries.length,
            textures: ownershipScene.textures.length,
        };

        try {
            const container = await LoadAssetContainerAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), ownershipScene, {
                pluginExtension: ".usda",
                name: RobotArmWrapperAsset.fileName,
                pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler({ objData: minimalObjData, expectedMeshCount: 1 }) } },
            });
            const ownedCounts = {
                meshes: container.meshes.length,
                materials: container.materials.length,
                geometries: container.geometries.length,
                textures: container.textures.length,
            };

            expect(ownedCounts.meshes).toBe(1);
            expect(ownedCounts.materials).toBe(1);
            expect(ownedCounts.geometries).toBe(1);
            expect(ownedCounts.textures).toBe(1);
            expect(ownershipScene.meshes.length).toBe(baseline.meshes);
            expect(ownershipScene.materials.length).toBe(baseline.materials);
            expect(ownershipScene.geometries.length).toBe(baseline.geometries);
            expect(ownershipScene.textures.length).toBe(baseline.textures);

            container.addAllToScene();
            expect(ownershipScene.meshes.length).toBe(baseline.meshes + ownedCounts.meshes);
            expect(ownershipScene.materials.length).toBe(baseline.materials + ownedCounts.materials);
            expect(ownershipScene.geometries.length).toBe(baseline.geometries + ownedCounts.geometries);
            expect(ownershipScene.textures.length).toBe(baseline.textures + ownedCounts.textures);

            container.removeAllFromScene();
            expect(ownershipScene.meshes.length).toBe(baseline.meshes);
            expect(ownershipScene.materials.length).toBe(baseline.materials);
            expect(ownershipScene.geometries.length).toBe(baseline.geometries);
            expect(ownershipScene.textures.length).toBe(baseline.textures);

            container.dispose();
            expect(container.meshes).toHaveLength(0);
            expect(container.materials).toHaveLength(0);
            expect(container.geometries).toHaveLength(0);
            expect(container.textures).toHaveLength(0);
            expect(container.transformNodes).toHaveLength(0);
            expect(ownershipScene.meshes.length).toBe(baseline.meshes);
            expect(ownershipScene.materials.length).toBe(baseline.materials);
            expect(ownershipScene.geometries.length).toBe(baseline.geometries);
            expect(ownershipScene.textures.length).toBe(baseline.textures);
        } finally {
            ownershipScene.dispose();
            ownershipEngine.dispose();
        }
    });

    it("logs a strict no-handler diagnostic with the authored prim property path", async () => {
        logMessages.length = 0;
        const noHandlerEngine = new NullEngine();
        const noHandlerScene = new Scene(noHandlerEngine);

        try {
            const noHandlerResult = await ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), noHandlerScene, {
                pluginExtension: ".usda",
                name: RobotArmWrapperAsset.fileName,
            });
            expect(noHandlerResult.meshes).toHaveLength(0);
            const diagnostic = logMessages.find((message) => message.includes("assetInfo:source") && message.includes("no external asset handler"));
            expect(diagnostic).toBeDefined();
            expect(diagnostic).toContain("/RobotArm/Asset.assetInfo:source");
        } finally {
            noHandlerScene.dispose();
            noHandlerEngine.dispose();
        }
    });

    it("rejects a missing OBJ sidecar through outer ImportMeshAsync", async () => {
        const missingEngine = new NullEngine();
        const missingScene = new Scene(missingEngine);

        try {
            const syntheticUsda = replaceAuthoredObjPath(readRuntimeCorpusText(RobotArmWrapperAsset.fileName), "./RobotArm/Missing.obj");
            await expect(
                ImportMeshAsync("data:" + syntheticUsda, missingScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler() } },
                })
            ).rejects.toThrow("OBJ sidecar not found");
        } finally {
            missingScene.dispose();
            missingEngine.dispose();
        }
    });

    it("rejects malformed OBJ data and disposes its temporary container", async () => {
        const malformedEngine = new NullEngine();
        const malformedScene = new Scene(malformedEngine);
        const malformedObj = "this is not valid OBJ data\n!@#$%^&*()";

        try {
            await expect(
                ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), malformedScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler({ objData: malformedObj }) } },
                })
            ).rejects.toThrow("Expected 8 Robot Arm meshes");
            expect(malformedScene.meshes).toHaveLength(0);
        } finally {
            malformedScene.dispose();
            malformedEngine.dispose();
        }
    });

    it("rejects a missing active MTL through the inner OBJ loader error path", async () => {
        const missingEngine = new NullEngine();
        const missingScene = new Scene(missingEngine);
        mtlLoadError = new Error("active MTL sidecar not found");

        try {
            await expect(
                ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), missingScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler({ objData: minimalObjData, expectedMeshCount: 1 }) } },
                })
            ).rejects.toThrow("active MTL sidecar not found");
        } finally {
            mtlLoadError = undefined;
            missingScene.dispose();
            missingEngine.dispose();
        }
    });

    it("rejects malformed active MTL data and disposes the loaded OBJ container", async () => {
        const malformedEngine = new NullEngine();
        const malformedScene = new Scene(malformedEngine);
        mtlDataOverride = "newmtl Wrong\nKd 1.0 0.0 0.0\n";

        try {
            await expect(
                ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), malformedScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler({ objData: minimalObjData, expectedMeshCount: 1 }) } },
                })
            ).rejects.toThrow("Active MTL did not produce the expected Robot_arm material");
        } finally {
            mtlDataOverride = undefined;
            malformedScene.dispose();
            malformedEngine.dispose();
        }
    });

    it("rejects a missing color texture through the handler validation seam", async () => {
        const missingEngine = new NullEngine();
        const missingScene = new Scene(missingEngine);
        mtlDataOverride = readCorpusFile("RobotArm/industrial_robot_arm.mtl").replace(expectedTextureName, "Missing_Color.png");

        try {
            await expect(
                ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), missingScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: { usd: { externalAssetHandler: createRobotArmHandler({ objData: minimalObjData, expectedMeshCount: 1 }) } },
                })
            ).rejects.toThrow("Expected color texture");
        } finally {
            mtlDataOverride = undefined;
            missingScene.dispose();
            missingEngine.dispose();
        }
    });

    it("rejects malformed color texture bytes through the handler validation seam", async () => {
        const malformedEngine = new NullEngine();
        const malformedScene = new Scene(malformedEngine);

        try {
            await expect(
                ImportMeshAsync("data:" + readRuntimeCorpusText(RobotArmWrapperAsset.fileName), malformedScene, {
                    pluginExtension: ".usda",
                    name: RobotArmWrapperAsset.fileName,
                    pluginOptions: {
                        usd: {
                            externalAssetHandler: createRobotArmHandler({
                                objData: minimalObjData,
                                expectedMeshCount: 1,
                                readTextureBytes: () => Buffer.alloc(33),
                            }),
                        },
                    },
                })
            ).rejects.toThrow("invalid PNG signature");
        } finally {
            malformedScene.dispose();
            malformedEngine.dispose();
        }
    });
});
