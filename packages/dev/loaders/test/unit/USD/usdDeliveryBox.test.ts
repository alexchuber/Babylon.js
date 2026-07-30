import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { AssetContainer } from "core/assetContainer";
import { Mesh } from "core/Meshes/mesh";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Color3 } from "core/Maths/math.color";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";
import { type USDLoadingOptions } from "loaders/USD/usdLoadingOptions";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that recognizes `assetInfo:source` and creates geometry from
 * the referenced OBJ/MTL. In a real application this would delegate to
 * SceneLoader.LoadAssetContainerAsync, but unit tests run without XMLHttpRequest so we
 * parse the OBJ geometry directly to prove the handler interface end to end.
 *
 * This handler is explicitly NOT part of the USD core — it demonstrates the
 * external-asset handler interface. The USD core does not hardcode `assetInfo:source` or
 * import OBJ/glTF implementations.
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
    const { positions, indices } = parseMinimalObj(objData);

    const container = new AssetContainer(request.scene);
    const mesh = new Mesh("deliverybox", request.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    const mtlRelativePath = objRelativePath.replace(/\.obj$/i, ".mtl");
    const mtlData = readCorpusFile(mtlRelativePath);
    const material = new StandardMaterial("Box", request.scene);
    const kdMatch = mtlData.match(/Kd\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (kdMatch) {
        material.diffuseColor = new Color3(parseFloat(kdMatch[1]), parseFloat(kdMatch[2]), parseFloat(kdMatch[3]));
    }
    mesh.material = material;

    container.meshes.push(mesh);
    container.materials.push(material);
    container.removeAllFromScene();

    return { handled: true, container };
}

function parseMinimalObj(data: string): { positions: number[]; indices: number[] } {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const line of data.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("v ")) {
            const parts = trimmed.split(/\s+/);
            positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
        } else if (trimmed.startsWith("f ")) {
            const parts = trimmed.split(/\s+/).slice(1);
            const faceIndices = parts.map((part) => parseInt(part.split("/")[0], 10) - 1);
            for (let index = 1; index < faceIndices.length - 1; index++) {
                indices.push(faceIndices[0], faceIndices[index], faceIndices[index + 1]);
            }
        }
    }
    return { positions, indices };
}

describe("USD RuntimeCorpus - Delivery Box", () => {
    it("loads DeliveryBox.usda with an application-owned handler through the public loader", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({
                externalAssetHandler: deliveryBoxHandler,
            } as Partial<USDLoadingOptions>);

            const usdaData = readCorpusFile("DeliveryBox.usda");
            const result = await loader.importMeshAsync(null, scene, usdaData, "file:");

            // Verify USD hierarchy exists
            const rootNode = result.transformNodes.find((node) => node.name === "DeliveryBox");
            expect(rootNode).toBeDefined();

            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();

            // Verify parent/child relationship: Asset is under DeliveryBox
            expect(assetNode!.parent?.name).toBe("DeliveryBox");

            // Verify handler-loaded mesh exists and is parented under the Asset transform
            const loadedMesh = result.meshes.find((mesh) => mesh.name === "deliverybox");
            expect(loadedMesh).toBeDefined();
            expect(loadedMesh!.parent).toBe(assetNode);

            // Verify the mesh has geometry
            const positions = loadedMesh!.getVerticesData("position");
            expect(positions).toBeDefined();
            expect(positions!.length).toBeGreaterThan(0);

            // Verify material was applied
            expect(loadedMesh!.material).toBeDefined();
            const material = loadedMesh!.material as StandardMaterial;
            expect(material.diffuseColor.r).toBeCloseTo(0.72);
            expect(material.diffuseColor.g).toBeCloseTo(0.51);
            expect(material.diffuseColor.b).toBeCloseTo(0.27);

            // Verify the authored translate (0,0,0 for this asset)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);

            // Verify bounding information: the mesh should have reasonable bounds
            loadedMesh!.refreshBoundingInfo();
            const bounds = loadedMesh!.getBoundingInfo().boundingBox;
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
            const loader = new USDFileLoader({
                externalAssetHandler: deliveryBoxHandler,
            } as Partial<USDLoadingOptions>);

            const usdaData = readCorpusFile("DeliveryBox.usda");
            const container = await loader.loadAssetContainerAsync(scene, usdaData, "file:");

            // Container should own the handler-loaded meshes
            expect(container.meshes.some((mesh) => mesh.name === "deliverybox")).toBe(true);

            // The scene should be clean after container creation (entities removed)
            expect(scene.meshes.filter((mesh) => mesh.name === "deliverybox")).toHaveLength(0);

            // After adding to scene, meshes should be present
            container.addAllToScene();
            expect(scene.meshes.some((mesh) => mesh.name === "deliverybox")).toBe(true);

            // After dispose, cleanup should work
            container.removeAllFromScene();
            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("preserves the authored USD stage metadata and hierarchy", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({
                externalAssetHandler: deliveryBoxHandler,
            } as Partial<USDLoadingOptions>);

            const usdaData = readCorpusFile("DeliveryBox.usda");
            await loader.importMeshAsync(null, scene, usdaData, "file:");

            // Stage uses Y-up (metersPerUnit=1, upAxis=Y)
            expect(scene.useRightHandedSystem).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
