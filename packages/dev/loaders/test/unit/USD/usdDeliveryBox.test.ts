import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { Logger } from "core/Misc/logger";
import { Tools } from "core/Misc/tools";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that recognizes `assetInfo:source` and delegates OBJ/MTL
 * loading to Babylon's registered OBJ file loader via the module-level
 * `LoadAssetContainerAsync`. In Vitest the `Tools.LoadFile` mock intercepts the MTL
 * network fetch and serves it from disk. In a browser this handler would work without
 * the mock.
 *
 * This handler is explicitly NOT part of the USD core.
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

    // Use the module-level API with the registered OBJ plugin
    const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
        pluginExtension: ".obj",
        rootUrl: "",
    });

    return { handled: true, container };
}

describe("USD RuntimeCorpus - Delivery Box", () => {
    let loadFileSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        // Mock Tools.LoadFile to serve MTL from disk when the OBJ loader requests it
        loadFileSpy = vi.spyOn(Tools, "LoadFile").mockImplementation(
            (url: string, onSuccess: (data: string | ArrayBuffer) => void) => {
                if (typeof url === "string" && url.endsWith(".mtl")) {
                    const mtlPath = url.split("/").pop() ?? url;
                    try {
                        const mtlData = readCorpusFile("DeliveryBox/" + mtlPath);
                        setTimeout(() => onSuccess(mtlData), 0);
                    } catch {
                        setTimeout(() => onSuccess(""), 0);
                    }
                } else {
                    setTimeout(() => onSuccess(""), 0);
                }
                return { abort: () => {} } as any;
            }
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads DeliveryBox.usda with handler preserving hierarchy, transform, geometry, and bounds", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: deliveryBoxHandler });
            const usdaData = readCorpusFile("DeliveryBox.usda");
            const result = await loader.importMeshAsync(null, scene, usdaData, "file:");

            // Verify authored USD hierarchy
            const rootNode = result.transformNodes.find((node) => node.name === "DeliveryBox");
            expect(rootNode).toBeDefined();

            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("DeliveryBox");

            // Verify handler-loaded content is parented under the Asset prim's transform
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

            // Verify the authored translate (0,0,0 for this asset)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify bounding information on loaded geometry
            const meshWithGeometry = result.meshes.find((mesh) => mesh.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            meshWithGeometry!.refreshBoundingInfo();
            const bounds = meshWithGeometry!.getBoundingInfo().boundingBox;
            expect(bounds.maximumWorld.x - bounds.minimumWorld.x).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads DeliveryBox.usda into an AssetContainer with correct outer ownership", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: deliveryBoxHandler });
            const usdaData = readCorpusFile("DeliveryBox.usda");
            const container = await loader.loadAssetContainerAsync(scene, usdaData, "file:");

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

    it("preserves the authored USD stage metadata", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: deliveryBoxHandler });
            const usdaData = readCorpusFile("DeliveryBox.usda");
            await loader.importMeshAsync(null, scene, usdaData, "file:");

            expect(scene.useRightHandedSystem).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
