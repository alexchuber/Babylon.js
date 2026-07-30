import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { Logger } from "core/Misc/logger";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { OBJFileLoader } from "loaders/OBJ/objFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that recognizes `assetInfo:source` and delegates OBJ loading
 * to Babylon's registered OBJ file loader via its `loadAssetContainerAsync` method.
 * Materials are skipped because the MTL fetch requires XMLHttpRequest, which is unavailable
 * in Vitest; in a browser environment the handler would use
 * `SceneLoader.LoadAssetContainerAsync` with full MTL support.
 *
 * This handler is explicitly NOT part of the USD core — it demonstrates the external-asset
 * handler interface. The USD core does not hardcode `assetInfo:source` or import OBJ/glTF.
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

    // Delegate to Babylon's OBJ loader via loadAssetContainerAsync.
    // skipMaterials avoids the MTL network fetch that requires XMLHttpRequest.
    const objLoader = new OBJFileLoader({ skipMaterials: true });
    const container = await objLoader.loadAssetContainerAsync(request.scene, objData, "");

    return { handled: true, container };
}

describe("USD RuntimeCorpus - Delivery Box", () => {
    beforeEach(() => {
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads DeliveryBox.usda with an application-owned handler preserving hierarchy, transform, geometry, and bounds", async () => {
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

            // Verify handler-loaded mesh is parented under the Asset prim's transform node
            expect(result.meshes.length).toBeGreaterThan(0);
            const loadedMeshes = result.meshes.filter((mesh) => mesh.parent === assetNode);
            expect(loadedMeshes.length).toBeGreaterThan(0);

            // Verify geometry is present with non-zero vertex count
            const meshWithGeometry = result.meshes.find((mesh) => mesh.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            const positions = meshWithGeometry!.getVerticesData("position");
            expect(positions).toBeDefined();
            expect(positions!.length).toBeGreaterThan(0);

            // Verify the authored translate (0,0,0 for this asset)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify bounding information: the mesh has non-zero spatial extent
            meshWithGeometry!.refreshBoundingInfo();
            const bounds = meshWithGeometry!.getBoundingInfo().boundingBox;
            expect(bounds.maximumWorld.x - bounds.minimumWorld.x).toBeGreaterThan(0);
            expect(bounds.maximumWorld.y - bounds.minimumWorld.y).toBeGreaterThan(0);
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

            // Container should own handler-loaded meshes
            const handlerMeshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
            expect(handlerMeshes.length).toBeGreaterThan(0);

            // Scene should be clean after container creation
            expect(scene.meshes.filter((m) => container.meshes.includes(m))).toHaveLength(0);

            // After adding to scene, meshes should be present
            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(0);

            container.removeAllFromScene();
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
