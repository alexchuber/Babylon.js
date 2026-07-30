import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { AssetContainer } from "core/assetContainer";
import { Mesh } from "core/Meshes/mesh";
import "core/Meshes/instancedMesh";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Color3 } from "core/Maths/math.color";
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
 * to Babylon's registered OBJ loader. Materials are skipped during the OBJ load (the MTL
 * fetch requires XMLHttpRequest unavailable in Vitest) and applied manually from the MTL
 * data on disk, matching what a browser-based handler would produce through
 * `SceneLoader.LoadAssetContainerAsync`.
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

    // Delegate to Babylon's OBJ loader with skipMaterials (MTL fetch needs browser XMLHttpRequest)
    const objLoader = new OBJFileLoader({ skipMaterials: true });
    const container = new AssetContainer(request.scene);
    const existingMeshes = new Set(request.scene.meshes);
    const existingMaterials = new Set(request.scene.materials);
    const existingGeometries = new Set(request.scene.geometries);

    await objLoader.importMeshAsync(null, request.scene, objData, "");

    for (const mesh of request.scene.meshes) {
        if (!existingMeshes.has(mesh)) {
            container.meshes.push(mesh);
        }
    }
    for (const material of request.scene.materials) {
        if (!existingMaterials.has(material)) {
            container.materials.push(material);
        }
    }
    for (const geometry of request.scene.geometries) {
        if (!existingGeometries.has(geometry)) {
            container.geometries.push(geometry);
        }
    }

    // Apply material from MTL (what SceneLoader.LoadAssetContainerAsync would do in a browser)
    const mtlRelativePath = objRelativePath.replace(/\.obj$/i, ".mtl");
    const mtlData = readCorpusFile(mtlRelativePath);
    const kdMatch = mtlData.match(/Kd\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (kdMatch) {
        const material = new StandardMaterial("Box", request.scene);
        material.diffuseColor = new Color3(parseFloat(kdMatch[1]), parseFloat(kdMatch[2]), parseFloat(kdMatch[3]));
        for (const mesh of container.meshes) {
            mesh.material = material;
        }
        container.materials.push(material);
    }

    container.removeAllFromScene();
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

    it("loads DeliveryBox.usda with an application-owned handler through the public loader", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: deliveryBoxHandler });
            const usdaData = readCorpusFile("DeliveryBox.usda");
            const result = await loader.importMeshAsync(null, scene, usdaData, "file:");

            // Verify USD hierarchy
            const rootNode = result.transformNodes.find((node) => node.name === "DeliveryBox");
            expect(rootNode).toBeDefined();

            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("DeliveryBox");

            // Verify handler-loaded mesh exists and is parented under the Asset transform
            expect(result.meshes.length).toBeGreaterThan(0);
            const loadedMeshes = result.meshes.filter((mesh) => mesh.parent === assetNode);
            expect(loadedMeshes.length).toBeGreaterThan(0);

            // Verify geometry is present (not empty)
            const meshWithGeometry = result.meshes.find((mesh) => mesh.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            const positions = meshWithGeometry!.getVerticesData("position");
            expect(positions).toBeDefined();
            expect(positions!.length).toBeGreaterThan(0);

            // Verify material color from MTL (Kd 0.72 0.51 0.27)
            const materialMesh = result.meshes.find((mesh) => mesh.material instanceof StandardMaterial);
            expect(materialMesh).toBeDefined();
            const material = materialMesh!.material as StandardMaterial;
            expect(material.diffuseColor.r).toBeCloseTo(0.72);
            expect(material.diffuseColor.g).toBeCloseTo(0.51);
            expect(material.diffuseColor.b).toBeCloseTo(0.27);

            // Verify the authored translate (0,0,0 for this asset)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify bounding information
            const boundedMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
            boundedMesh!.refreshBoundingInfo();
            const bounds = boundedMesh!.getBoundingInfo().boundingBox;
            expect(bounds.maximumWorld.x - bounds.minimumWorld.x).toBeGreaterThan(0);
            expect(bounds.maximumWorld.y - bounds.minimumWorld.y).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads DeliveryBox.usda into an AssetContainer with correct ownership", async () => {
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
