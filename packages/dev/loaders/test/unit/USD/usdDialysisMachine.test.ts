import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
import { ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that delegates OBJ loading to Babylon's registered OBJ plugin
 * via the module-level `LoadAssetContainerAsync`. `Tools.LoadFile` is mocked in the test
 * setup to serve MTL data from disk.
 */
async function dialysisMachineHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
    if (request.propertyName !== "assetInfo:source") {
        return { handled: false };
    }
    const extension = request.authoredUri.split(".").pop()?.toLowerCase();
    if (extension !== "obj") {
        return { handled: false };
    }

    const objRelativePath = request.authoredUri.replace(/^\.\//, "");
    const objData = readCorpusFile(objRelativePath);

    const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
        pluginExtension: ".obj",
        rootUrl: "",
    });

    return { handled: true, container };
}

describe("USD RuntimeCorpus - Dialysis Machine", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        // Mock Tools.LoadFile to serve MTL from disk.
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
                        const mtlData = readCorpusFile("DialysisMachine/" + mtlName);
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
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads DialysisMachine.usda via ImportMeshAsync with authored rotation, scale, hierarchy, and OBJ geometry", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: dialysisMachineHandler } },
            });

            // Verify authored USD hierarchy: DialysisMachine > Asset
            const rootNode = result.transformNodes.find((node) => node.name === "DialysisMachine");
            expect(rootNode).toBeDefined();

            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("DialysisMachine");

            // Verify authored transform: translate (0,0,0)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify authored rotation: -90 degrees about X axis (stored as quaternion)
            expect(assetNode!.rotationQuaternion).toBeDefined();
            expect(assetNode!.rotationQuaternion!.x).toBeCloseTo(-Math.SQRT1_2, 4);
            expect(assetNode!.rotationQuaternion!.y).toBeCloseTo(0, 4);
            expect(assetNode!.rotationQuaternion!.z).toBeCloseTo(0, 4);
            expect(assetNode!.rotationQuaternion!.w).toBeCloseTo(Math.SQRT1_2, 4);

            // Verify authored scale: uniform 0.02
            expect(assetNode!.scaling.x).toBeCloseTo(0.02, 4);
            expect(assetNode!.scaling.y).toBeCloseTo(0.02, 4);
            expect(assetNode!.scaling.z).toBeCloseTo(0.02, 4);

            // Handler-loaded content must be parented under the Asset prim
            const childMeshes = result.meshes.filter((m) => {
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

            // Exact OBJ geometry: 288 mesh groups with 32 unique materials
            const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
            expect(meshesWithGeometry.length).toBe(288);

            // Exact total vertex and index counts from OBJ loader vertex splitting
            let totalVertices = 0;
            let totalIndices = 0;
            for (const mesh of meshesWithGeometry) {
                totalVertices += mesh.getTotalVertices();
                totalIndices += mesh.getTotalIndices();
            }
            expect(totalVertices).toBe(217169);
            expect(totalIndices).toBe(521751);

            // All imported materials must be StandardMaterial (from OBJ/MTL), 32 unique
            const materials = new Set<string>();
            for (const mesh of meshesWithGeometry) {
                if (mesh.material) {
                    materials.add(mesh.material.name);
                    expect(mesh.material).toBeInstanceOf(StandardMaterial);
                }
            }
            expect(materials.size).toBe(32);

            // Verify normals are present (OBJ has authored normals)
            for (const mesh of meshesWithGeometry) {
                const normals = mesh.getVerticesData("normal");
                expect(normals).toBeDefined();
                expect(normals!.length).toBeGreaterThan(0);
            }

            // Compute and verify deterministic final world bounds
            for (const mesh of meshesWithGeometry) {
                mesh.computeWorldMatrix(true);
                mesh.refreshBoundingInfo();
            }
            let minX = Infinity,
                minY = Infinity,
                minZ = Infinity;
            let maxX = -Infinity,
                maxY = -Infinity,
                maxZ = -Infinity;
            for (const mesh of meshesWithGeometry) {
                const b = mesh.getBoundingInfo().boundingBox;
                minX = Math.min(minX, b.minimumWorld.x);
                minY = Math.min(minY, b.minimumWorld.y);
                minZ = Math.min(minZ, b.minimumWorld.z);
                maxX = Math.max(maxX, b.maximumWorld.x);
                maxY = Math.max(maxY, b.maximumWorld.y);
                maxZ = Math.max(maxZ, b.maximumWorld.z);
            }
            // Bounds after authored -90° X rotation and 0.02 scale
            const worldWidth = maxX - minX;
            const worldHeight = maxY - minY;
            const worldDepth = maxZ - minZ;
            expect(worldWidth).toBeCloseTo(1.405674, 3);
            expect(worldHeight).toBeCloseTo(3.548796, 3);
            expect(worldDepth).toBeCloseTo(1.725718, 3);
            expect(minY).toBeCloseTo(0, 3);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads DialysisMachine.usda via LoadAssetContainerAsync with correct ownership", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: dialysisMachineHandler } },
            });

            expect(container.meshes.length).toBeGreaterThan(0);
            expect(scene.meshes.length).toBe(0);

            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(0);

            container.removeAllFromScene();
            expect(scene.meshes.length).toBe(0);

            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("preserves stage metadata (Y-up, metersPerUnit=1)", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: dialysisMachineHandler } },
            });

            expect(scene.useRightHandedSystem).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("fails through normal SceneLoader error when OBJ sidecar is missing", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // Handler that tries to load from a non-existent path
        async function missingObjHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            // Attempt to load nonexistent OBJ data — throws naturally
            const container = await LoadAssetContainerAsync("data:", request.scene, {
                pluginExtension: ".obj",
                rootUrl: "",
            });
            return { handled: true, container };
        }

        try {
            const usdaData = readCorpusFile("DialysisMachine.usda");
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: missingObjHandler } },
                })
            ).rejects.toThrow();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
