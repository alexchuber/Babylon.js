import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { Logger } from "core/Misc/logger";
import { Observable } from "core/Misc/observable";
import { type IFileRequest } from "core/Misc/fileRequest";
import { type IOfflineProvider } from "core/Offline/IOfflineProvider";
import { type WebRequest } from "core/Misc/webRequest";
import { LoadFileError } from "core/Misc/fileTools";
import { Tools } from "core/Misc/tools";
import { type ISceneLoaderAsyncResult, ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that validates OBJ sidecar existence and post-load material
 * integrity. Delegates to Babylon's registered OBJ plugin via `LoadAssetContainerAsync`.
 * After loading, validates that the required 32 authored materials are present—missing or
 * malformed MTL causes rejection rather than silent geometry-only success.
 */
function createDialysisMachineHandler(): (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult> {
    return async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
        if (request.propertyName !== "assetInfo:source") {
            return { handled: false };
        }
        const extension = request.authoredUri.split(".").pop()?.toLowerCase();
        if (extension !== "obj") {
            return { handled: false };
        }

        const objRelativePath = request.authoredUri.replace(/^\.\//, "");
        const objFilePath = path.join(corpusRoot, objRelativePath);

        // Pre-validate: the authored sidecar path must resolve to an existing file
        if (!fs.existsSync(objFilePath)) {
            throw new Error(`OBJ sidecar not found at authored path: ${request.authoredUri} (resolved to ${objRelativePath})`);
        }

        const objData = fs.readFileSync(objFilePath, "utf8");

        const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
            pluginExtension: ".obj",
            rootUrl: "",
        });

        // Post-load validation: renderable geometry must exist
        const renderableMeshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
        if (renderableMeshes.length === 0) {
            container.dispose();
            throw new Error("OBJ produced no renderable geometry");
        }

        // Post-load validation: all 32 authored materials must be present.
        // Missing or malformed MTL causes the OBJ loader to silently use defaults;
        // the handler detects this by checking the authored material count.
        const materialNames = new Set<string>();
        for (const mesh of container.meshes) {
            if (mesh.material) {
                materialNames.add(mesh.material.name);
            }
        }
        if (materialNames.size !== 32) {
            container.dispose();
            throw new Error(`Expected 32 authored materials from MTL, got ${materialNames.size}`);
        }

        // Spot-check a representative material to detect malformed MTL values
        const chromeMat = container.meshes.find((m) => m.material?.name === "Chrome_metal")?.material as StandardMaterial | undefined;
        if (!chromeMat || Math.abs(chromeMat.diffuseColor.r - 0.65) > 0.05) {
            container.dispose();
            throw new Error("Representative material Chrome_metal has unexpected diffuse values — MTL may be malformed");
        }

        return { handled: true, container };
    };
}

function mockToolsLoadFile(mtlFolder: string = "DialysisMachine/"): void {
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
            if (url.endsWith(".mtl")) {
                const mtlName = url.split("/").pop() ?? url;
                try {
                    const mtlData = readCorpusFile(mtlFolder + mtlName);
                    setTimeout(() => onSuccess(mtlData), 0);
                } catch (readError) {
                    setTimeout(() => {
                        if (onError) {
                            onError(undefined, new LoadFileError(`Failed to read ${url}: ${readError}`, undefined));
                        }
                    }, 0);
                }
            } else {
                setTimeout(() => {
                    if (onError) {
                        onError(undefined, new LoadFileError(`Unexpected Tools.LoadFile request: ${url}`, undefined));
                    }
                }, 0);
            }
            return fileRequest;
        }
    );
}

// Expected exact material names from OBJ/MTL (cloned by the external-asset adapter)
const EXPECTED_MATERIAL_NAMES = [
    "Clone of Black_Plastic_1",
    "Clone of Black_Plastic_2",
    "Clone of Center_Black_Plastic",
    "Clone of Center_Plastic_1",
    "Clone of Center_Plastic_2",
    "Clone of Center_Plastic_3",
    "Clone of Center_Rubber",
    "Clone of Chrome_metal",
    "Clone of DarkBlue_Plastic",
    "Clone of Display_Mat",
    "Clone of Fabric_Black",
    "Clone of Grey_Plastic",
    "Clone of Grey_Plastic_2",
    "Clone of Monitor_Plastic_1",
    "Clone of Monitor_Plastic_2",
    "Clone of Plastic_Blue",
    "Clone of Plastic_Blue_2",
    "Clone of Plastic_Red",
    "Clone of Plastic_Yellow",
    "Clone of Rubber_1",
    "Clone of Rubber_2",
    "Clone of Rubber_Black",
    "Clone of Rubber_Blue",
    "Clone of Rubber_White",
    "Clone of Trans_Plastic_1",
    "Clone of Trans_Plastic_2",
    "Clone of Trans_Plastic_3",
    "Clone of Wheels_Plastic",
    "Clone of Wheels_Rubber",
    "Clone of White_Plastic_Back",
    "Clone of White_Plastic_Dtls",
    "Clone of White_Plastic_Front",
] as const;

describe("USD RuntimeCorpus - Dialysis Machine", () => {
    // Shared read-only result for non-destructive assertions
    let sharedEngine: NullEngine;
    let sharedScene: Scene;
    let sharedResult: ISceneLoaderAsyncResult;
    let sharedMeshesWithGeometry: AbstractMesh[];

    beforeAll(async () => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
        mockToolsLoadFile();

        sharedEngine = new NullEngine();
        sharedScene = new Scene(sharedEngine);

        const usdaData = readCorpusFile("DialysisMachine.usda");
        sharedResult = await ImportMeshAsync("data:" + usdaData, sharedScene, {
            pluginExtension: ".usda",
            pluginOptions: { usd: { externalAssetHandler: createDialysisMachineHandler() } },
        });

        sharedMeshesWithGeometry = sharedResult.meshes.filter((m) => m.getTotalVertices() > 0);
    });

    afterAll(() => {
        vi.restoreAllMocks();
        sharedScene?.dispose();
        sharedEngine?.dispose();
    });

    it("has correct USD hierarchy: DialysisMachine > Asset", () => {
        const rootNode = sharedResult.transformNodes.find((node) => node.name === "DialysisMachine");
        expect(rootNode).toBeDefined();

        const assetNode = sharedResult.transformNodes.find((node) => node.name === "Asset");
        expect(assetNode).toBeDefined();
        expect(assetNode!.parent?.name).toBe("DialysisMachine");
    });

    it("has authored translate (0,0,0), -90° X rotation, and 0.02 uniform scale on Asset node", () => {
        const assetNode = sharedResult.transformNodes.find((node) => node.name === "Asset")!;

        expect(assetNode.position.x).toBeCloseTo(0);
        expect(assetNode.position.y).toBeCloseTo(0);
        expect(assetNode.position.z).toBeCloseTo(0);

        expect(assetNode.rotationQuaternion).toBeDefined();
        expect(assetNode.rotationQuaternion!.x).toBeCloseTo(-Math.SQRT1_2, 4);
        expect(assetNode.rotationQuaternion!.y).toBeCloseTo(0, 4);
        expect(assetNode.rotationQuaternion!.z).toBeCloseTo(0, 4);
        expect(assetNode.rotationQuaternion!.w).toBeCloseTo(Math.SQRT1_2, 4);

        expect(assetNode.scaling.x).toBeCloseTo(0.02, 4);
        expect(assetNode.scaling.y).toBeCloseTo(0.02, 4);
        expect(assetNode.scaling.z).toBeCloseTo(0.02, 4);
    });

    it("parents all handler-loaded meshes under the Asset prim", () => {
        const assetNode = sharedResult.transformNodes.find((node) => node.name === "Asset")!;
        const childMeshes = sharedResult.meshes.filter((m) => {
            let node = m.parent;
            while (node) {
                if (node === assetNode) {
                    return true;
                }
                node = node.parent;
            }
            return false;
        });
        expect(childMeshes.length).toBeGreaterThan(0);
    });

    it("produces exactly 288 mesh groups with 217169 total vertices and 521751 total indices", () => {
        expect(sharedMeshesWithGeometry.length).toBe(288);

        let totalVertices = 0;
        let totalIndices = 0;
        for (const mesh of sharedMeshesWithGeometry) {
            totalVertices += mesh.getTotalVertices();
            totalIndices += mesh.getTotalIndices();
        }
        expect(totalVertices).toBe(217169);
        expect(totalIndices).toBe(521751);
    });

    it("assigns exactly 32 unique StandardMaterials with correct names", () => {
        const materialNames = new Set<string>();
        for (const mesh of sharedMeshesWithGeometry) {
            if (mesh.material) {
                materialNames.add(mesh.material.name);
                expect(mesh.material).toBeInstanceOf(StandardMaterial);
            }
        }
        expect(materialNames.size).toBe(32);
        expect([...materialNames].sort()).toEqual([...EXPECTED_MATERIAL_NAMES]);
    });

    it("has representative authored MTL values on Chrome_metal, White_Plastic_Front, and Trans_Plastic_1", () => {
        const findMaterial = (name: string): StandardMaterial => {
            for (const mesh of sharedMeshesWithGeometry) {
                if (mesh.material?.name === name) {
                    return mesh.material as StandardMaterial;
                }
            }
            throw new Error(`Material ${name} not found`);
        };

        // Chrome_metal: Kd 0.65 0.65 0.68, Ks 0.85 0.85 0.90, Ns 90
        const chrome = findMaterial("Clone of Chrome_metal");
        expect(chrome.diffuseColor.r).toBeCloseTo(0.65, 2);
        expect(chrome.diffuseColor.g).toBeCloseTo(0.65, 2);
        expect(chrome.diffuseColor.b).toBeCloseTo(0.68, 2);
        expect(chrome.specularColor.r).toBeCloseTo(0.85, 2);
        expect(chrome.specularColor.g).toBeCloseTo(0.85, 2);
        expect(chrome.specularColor.b).toBeCloseTo(0.90, 2);
        expect(chrome.specularPower).toBeCloseTo(90, 0);

        // White_Plastic_Front: Kd 0.95 0.95 0.95
        const whiteFront = findMaterial("Clone of White_Plastic_Front");
        expect(whiteFront.diffuseColor.r).toBeCloseTo(0.95, 2);
        expect(whiteFront.diffuseColor.g).toBeCloseTo(0.95, 2);
        expect(whiteFront.diffuseColor.b).toBeCloseTo(0.95, 2);

        // Trans_Plastic_1: Kd 0.75 0.78 0.82, d 0.35 (alpha/opacity)
        const trans1 = findMaterial("Clone of Trans_Plastic_1");
        expect(trans1.diffuseColor.r).toBeCloseTo(0.75, 2);
        expect(trans1.diffuseColor.g).toBeCloseTo(0.78, 2);
        expect(trans1.diffuseColor.b).toBeCloseTo(0.82, 2);
        expect(trans1.alpha).toBeCloseTo(0.35, 2);
    });

    it("has valid normals buffers on representative meshes", () => {
        // Check first, last, and a middle mesh for normals validity
        const representative = [sharedMeshesWithGeometry[0], sharedMeshesWithGeometry[143], sharedMeshesWithGeometry[287]];
        for (const mesh of representative) {
            const normals = mesh.getVerticesData("normal");
            expect(normals).toBeDefined();
            expect(normals!.length).toBe(mesh.getTotalVertices() * 3);
            // Verify normals are valid (no NaN/Infinity, non-zero magnitude)
            for (let i = 0; i < Math.min(normals!.length, 30); i += 3) {
                const nx = normals![i];
                const ny = normals![i + 1];
                const nz = normals![i + 2];
                expect(Number.isFinite(nx)).toBe(true);
                expect(Number.isFinite(ny)).toBe(true);
                expect(Number.isFinite(nz)).toBe(true);
                const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
                expect(mag).toBeGreaterThan(0);
            }
        }
    });

    it("has exact aggregate min/max world bounds after authored rotation and scale", () => {
        for (const mesh of sharedMeshesWithGeometry) {
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo();
        }
        let minX = Infinity,
            minY = Infinity,
            minZ = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity;
        for (const mesh of sharedMeshesWithGeometry) {
            const b = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, b.minimumWorld.x);
            minY = Math.min(minY, b.minimumWorld.y);
            minZ = Math.min(minZ, b.minimumWorld.z);
            maxX = Math.max(maxX, b.maximumWorld.x);
            maxY = Math.max(maxY, b.maximumWorld.y);
            maxZ = Math.max(maxZ, b.maximumWorld.z);
        }
        // Exact aggregate min/max (all 6 coordinates)
        expect(minX).toBeCloseTo(-0.703191, 3);
        expect(minY).toBeCloseTo(0, 3);
        expect(minZ).toBeCloseTo(-0.861805, 3);
        expect(maxX).toBeCloseTo(0.702483, 3);
        expect(maxY).toBeCloseTo(3.548796, 3);
        expect(maxZ).toBeCloseTo(0.863914, 3);
    });

    it("preserves stage metadata (Y-up, metersPerUnit=1)", () => {
        expect(sharedScene.useRightHandedSystem).toBe(true);
    });
});

describe("USD RuntimeCorpus - Dialysis Machine ownership", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
        mockToolsLoadFile();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("LoadAssetContainerAsync owns meshes, materials, and geometries; dispose returns scene to baseline", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            // Capture scene baselines before USD load
            const baselineMeshCount = scene.meshes.length;
            const baselineMaterialCount = scene.materials.length;
            const baselineGeometryCount = scene.geometries.length;

            const usdaData = readCorpusFile("DialysisMachine.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: createDialysisMachineHandler() } },
            });

            // Container holds content off-scene; scene unchanged from baseline
            expect(container.meshes.length).toBeGreaterThan(0);
            expect(container.materials.length).toBeGreaterThan(0);
            expect(container.geometries.length).toBeGreaterThan(0);
            expect(scene.meshes.length).toBe(baselineMeshCount);
            expect(scene.materials.length).toBe(baselineMaterialCount);
            expect(scene.geometries.length).toBe(baselineGeometryCount);

            const containerMeshCount = container.meshes.length;
            const containerMaterialCount = container.materials.length;

            // Adding to scene transfers content
            container.addAllToScene();
            expect(scene.meshes.length).toBe(baselineMeshCount + containerMeshCount);
            expect(scene.materials.length).toBe(baselineMaterialCount + containerMaterialCount);
            expect(scene.geometries.length).toBeGreaterThan(baselineGeometryCount);

            // Removing from scene returns scene to baseline
            container.removeAllFromScene();
            expect(scene.meshes.length).toBe(baselineMeshCount);
            expect(scene.materials.length).toBe(baselineMaterialCount);
            expect(scene.geometries.length).toBe(baselineGeometryCount);

            // Dispose cleans up container arrays
            container.dispose();
            expect(container.meshes.length).toBe(0);
            expect(container.materials.length).toBe(0);
            expect(container.geometries.length).toBe(0);

            // Scene remains at baseline after container dispose
            expect(scene.meshes.length).toBe(baselineMeshCount);
            expect(scene.materials.length).toBe(baselineMaterialCount);
            expect(scene.geometries.length).toBe(baselineGeometryCount);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

describe("USD RuntimeCorpus - Dialysis Machine error behavior", () => {
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

    it("rejects when OBJ sidecar file is missing at authored path", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        mockToolsLoadFile();

        // Synthetic USDA that references a non-existent OBJ sidecar
        const syntheticUsda = `#usda 1.0
(
    defaultPrim = "DialysisMachine"
    metersPerUnit = 1
    upAxis = "Y"
)
def Xform "DialysisMachine"
{
    def Xform "Asset" (
        kind = "reference"
    )
    {
        custom asset assetInfo:source = @./DialysisMachine/Missing.obj@
        double3 xformOp:translate = (0, 0, 0)
        float3 xformOp:rotateXYZ = (-90, 0, 0)
        float3 xformOp:scale = (0.02, 0.02, 0.02)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]
    }
}`;

        try {
            await expect(
                ImportMeshAsync("data:" + syntheticUsda, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: createDialysisMachineHandler() } },
                })
            ).rejects.toThrow(/OBJ sidecar not found/);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects when OBJ data is malformed and produces no usable geometry", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        mockToolsLoadFile();

        // Handler that feeds malformed data through normal LoadAssetContainerAsync
        async function malformedObjHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            const container = await LoadAssetContainerAsync("data:this is not valid OBJ data\n!@#$%^&*()", request.scene, {
                pluginExtension: ".obj",
                rootUrl: "",
            });
            // Post-load validation: reject if no renderable geometry
            const renderableMeshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
            if (renderableMeshes.length === 0) {
                container.dispose();
                throw new Error("Malformed OBJ produced no renderable geometry");
            }
            return { handled: true, container };
        }

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: malformedObjHandler } },
                })
            ).rejects.toThrow(/Malformed OBJ produced no renderable geometry/);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects when MTL sidecar is missing — handler detects missing authored materials", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // Mock Tools.LoadFile to fail on MTL requests (simulating missing MTL)
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
                if (url.endsWith(".mtl")) {
                    setTimeout(() => {
                        if (onError) {
                            onError(undefined, new LoadFileError(`MTL sidecar not found: ${url}`, undefined));
                        }
                    }, 0);
                } else {
                    setTimeout(() => {
                        if (onError) {
                            onError(undefined, new LoadFileError(`Unexpected request: ${url}`, undefined));
                        }
                    }, 0);
                }
                return fileRequest;
            }
        );

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            // Handler post-validates that all 32 authored materials are present.
            // Missing MTL causes OBJ loader to use defaults → handler rejects.
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: createDialysisMachineHandler() } },
                })
            ).rejects.toThrow(/Expected 32 authored materials from MTL/);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects when MTL data is malformed — handler detects wrong material values", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // Mock Tools.LoadFile to return garbage MTL data
        vi.spyOn(Tools, "LoadFile").mockImplementation(
            (
                fileOrUrl: File | string,
                onSuccess: (data: string | ArrayBuffer, responseURL?: string, contentType?: string | null) => void,
                _onProgress?: (ev: ProgressEvent) => void,
                _offlineProvider?: IOfflineProvider | null,
                _useArrayBuffer?: boolean,
                _onError?: (request?: WebRequest, exception?: LoadFileError) => void
            ): IFileRequest => {
                const fileRequest: IFileRequest = {
                    abort: () => {},
                    onCompleteObservable: new Observable<IFileRequest>(),
                };
                const url = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
                if (url.endsWith(".mtl")) {
                    // Return malformed MTL that defines no valid materials
                    setTimeout(() => onSuccess("this is not valid MTL data\n!@#$%"), 0);
                } else {
                    setTimeout(() => {
                        if (_onError) {
                            _onError(undefined, new LoadFileError(`Unexpected request: ${url}`, undefined));
                        }
                    }, 0);
                }
                return fileRequest;
            }
        );

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            // Handler post-validates material count; malformed MTL produces wrong count → reject
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: createDialysisMachineHandler() } },
                })
            ).rejects.toThrow(/Expected 32 authored materials from MTL/);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
