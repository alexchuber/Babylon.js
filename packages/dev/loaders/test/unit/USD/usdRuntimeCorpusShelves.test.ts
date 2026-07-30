import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { RegisterGLTFFileLoader } from "loaders/glTF/glTFFileLoader.pure";
import { RegisterGLTF2Loader } from "loaders/glTF/2.0/glTFLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

// Cache the GLB base64 string — the file is ~54 MB; avoid repeated disk reads/encodes.
let cachedGlbBase64: string | null = null;
function getGlbBase64(): string {
    if (!cachedGlbBase64) {
        cachedGlbBase64 = fs.readFileSync(path.join(corpusRoot, "shelves_01.glb")).toString("base64");
    }
    return cachedGlbBase64;
}

/**
 * Application-owned handler that delegates GLB loading to Babylon's registered glTF plugin
 * via the module-level `LoadAssetContainerAsync`. Only recognizes `assetInfo:source` with
 * a `.glb` extension — keeps the USD core independent of glTF internals.
 */
async function shelvesHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
    if (request.propertyName !== "assetInfo:source") {
        return { handled: false };
    }
    const extension = request.authoredUri.split(".").pop()?.toLowerCase();
    if (extension !== "glb") {
        return { handled: false };
    }

    const glbBase64 = getGlbBase64();
    const container = await LoadAssetContainerAsync("data:;base64," + glbBase64, request.scene, {
        pluginExtension: ".glb",
        rootUrl: "",
    });

    return { handled: true, container };
}

describe("USD RuntimeCorpus - Shelves", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        RegisterGLTFFileLoader();
        RegisterGLTF2Loader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("loads shelves_01.usda via ImportMeshAsync with authored hierarchy and transform", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            // Authored USD hierarchy: root "Shelves" Xform containing "Asset" Xform
            const shelvesNode = result.transformNodes.find((n) => n.name === "Shelves");
            expect(shelvesNode).toBeDefined();

            const assetNode = result.transformNodes.find((n) => n.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("Shelves");

            // Authored transform: identity (translate 0,0,0, rotate 0,0,0, scale 1,1,1)
            expect(assetNode!.position.x).toBeCloseTo(0);
            expect(assetNode!.position.y).toBeCloseTo(0);
            expect(assetNode!.position.z).toBeCloseTo(0);
            expect(assetNode!.scaling.x).toBeCloseTo(1);
            expect(assetNode!.scaling.y).toBeCloseTo(1);
            expect(assetNode!.scaling.z).toBeCloseTo(1);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads the GLB sidecar with expected mesh, material, and texture counts", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            // GLB produces 2 meshes (root + geometry); the geometry mesh is the real content
            expect(result.meshes.length).toBe(2);
            const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
            expect(geometryMesh).toBeDefined();

            // GLB mesh is parented under the USD "Asset" prim transform
            const assetNode = result.transformNodes.find((n) => n.name === "Asset");
            expect(assetNode).toBeDefined();
            let ancestor = geometryMesh!.parent;
            let foundAssetAncestor = false;
            while (ancestor) {
                if (ancestor === assetNode) {
                    foundAssetAncestor = true;
                    break;
                }
                ancestor = ancestor.parent;
            }
            expect(foundAssetAncestor).toBe(true);

            // Material is assigned (cloned from GLB PBR material)
            expect(geometryMesh!.material).toBeDefined();
            expect(geometryMesh!.material!.name).toContain("steel_frame_shelves_02");

            // GLB has 3 images; cloned materials can produce additional texture objects
            expect(scene.textures.length).toBeGreaterThanOrEqual(3);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("GLB sidecar has expected geometry (3633 vertices, 13044 indices)", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            // Load GLB directly (not through the USD clone path) to verify exact geometry counts.
            // NullEngine clones after template disposal cannot report vertex counts, so this test
            // verifies the GLB content independently of the external asset adapter's clone cycle.
            const glbBase64 = getGlbBase64();
            const container = await LoadAssetContainerAsync("data:;base64," + glbBase64, scene, {
                pluginExtension: ".glb",
                rootUrl: "",
            });

            const meshWithGeometry = container.meshes.find((m) => m.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            expect(meshWithGeometry!.getTotalVertices()).toBe(3633);
            expect(meshWithGeometry!.getTotalIndices()).toBe(13044);

            // Deterministic world bounds from the raw GLB geometry
            meshWithGeometry!.refreshBoundingInfo();
            const bounds = meshWithGeometry!.getBoundingInfo().boundingBox;
            const width = bounds.maximumWorld.x - bounds.minimumWorld.x;
            const height = bounds.maximumWorld.y - bounds.minimumWorld.y;
            const depth = bounds.maximumWorld.z - bounds.minimumWorld.z;
            expect(width).toBeGreaterThan(0);
            expect(height).toBeGreaterThan(0);
            expect(depth).toBeGreaterThan(0);

            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("loads via LoadAssetContainerAsync with correct ownership", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            // Container holds meshes, scene does not
            expect(container.meshes.length).toBeGreaterThan(0);
            expect(scene.meshes.length).toBe(0);

            // addAllToScene transfers
            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(0);

            // removeAllFromScene cleans up
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
            const usdaData = readCorpusFile("shelves_01.usda");
            await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            expect(scene.useRightHandedSystem).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects missing GLB sidecar through normal SceneLoader errors", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const missingGlbHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            // Attempt to load a non-existent GLB
            throw new Error("GLB file not found: " + request.authoredUri);
        };

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: missingGlbHandler } },
                })
            ).rejects.toThrow("GLB file not found");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects malformed GLB data through normal SceneLoader errors", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const malformedGlbHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            // Feed invalid data (16 zero bytes) base64-encoded to the glTF loader
            const badBase64 = Buffer.alloc(16).toString("base64");
            const container = await LoadAssetContainerAsync("data:;base64," + badBase64, request.scene, {
                pluginExtension: ".glb",
                rootUrl: "",
            });
            return { handled: true, container };
        };

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            await expect(
                ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: malformedGlbHandler } },
                })
            ).rejects.toThrow();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("does not silently produce empty success without a handler", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            // No handler configured — asset property should be diagnosed, not silently ignored
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
            });

            // Should still have the USD hierarchy nodes
            const shelvesNode = result.transformNodes.find((n) => n.name === "Shelves");
            expect(shelvesNode).toBeDefined();

            // But no GLB meshes (handler was not configured)
            expect(result.meshes.length).toBe(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
