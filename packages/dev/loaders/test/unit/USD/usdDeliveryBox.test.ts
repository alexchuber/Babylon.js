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
async function deliveryBoxHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
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

describe("USD RuntimeCorpus - Delivery Box", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        // Mock Tools.LoadFile to serve MTL from disk with the actual LoadFile signature.
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
                        const mtlData = readCorpusFile("DeliveryBox/" + mtlName);
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

    it("loads DeliveryBox.usda via module-level ImportMeshAsync with exact geometry, bounds, material, and parenting", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("DeliveryBox.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: deliveryBoxHandler } },
            });

            // Verify authored USD hierarchy
            const rootNode = result.transformNodes.find((node) => node.name === "DeliveryBox");
            expect(rootNode).toBeDefined();

            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("DeliveryBox");

            // Verify authored transform (translate 0,0,0)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify handler-loaded content is parented under the Asset prim
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

            // Exact OBJ geometry: DeliveryBox.obj loaded by OBJ plugin with vertex splitting
            const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            expect(meshWithGeometry!.getTotalVertices()).toBe(520);
            expect(meshWithGeometry!.getTotalIndices()).toBe(816);

            // Exact authored bounds from OBJ vertices (5.504698 × 3.133665 × 3.835611)
            meshWithGeometry!.refreshBoundingInfo();
            const bounds = meshWithGeometry!.getBoundingInfo().boundingBox;
            const width = bounds.maximumWorld.x - bounds.minimumWorld.x;
            const height = bounds.maximumWorld.y - bounds.minimumWorld.y;
            const depth = bounds.maximumWorld.z - bounds.minimumWorld.z;
            expect(width).toBeCloseTo(5.504698, 3);
            expect(height).toBeCloseTo(3.133665, 3);
            expect(depth).toBeCloseTo(3.835611, 3);

            // MTL material: StandardMaterial with diffuseColor from Kd (0.72, 0.51, 0.27)
            expect(meshWithGeometry!.material).toBeDefined();
            expect(meshWithGeometry!.material).toBeInstanceOf(StandardMaterial);
            const material = meshWithGeometry!.material as StandardMaterial;
            expect(material.name).toBe("Clone of Box");
            expect(material.diffuseColor.r).toBeCloseTo(0.72, 2);
            expect(material.diffuseColor.g).toBeCloseTo(0.51, 2);
            expect(material.diffuseColor.b).toBeCloseTo(0.27, 2);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads DeliveryBox.usda via module-level LoadAssetContainerAsync with correct ownership", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("DeliveryBox.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: deliveryBoxHandler } },
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
            const usdaData = readCorpusFile("DeliveryBox.usda");
            await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: deliveryBoxHandler } },
            });

            expect(scene.useRightHandedSystem).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
