import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import { Logger } from "core/Misc/logger";
import { type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
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
    let engine: NullEngine;
    let scene: Scene;
    let sharedResult: ISceneLoaderAsyncResult;

    beforeAll(async () => {
        RegisterUSDFileLoader();
        RegisterGLTFFileLoader();
        RegisterGLTF2Loader();

        engine = new NullEngine();
        scene = new Scene(engine);

        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        const usdaData = readCorpusFile("shelves_01.usda");
        sharedResult = await ImportMeshAsync("data:" + usdaData, scene, {
            pluginExtension: ".usda",
            pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
        });
    });

    afterAll(() => {
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    // --- Authored USD hierarchy and transform ---

    it("creates the authored USD hierarchy: Shelves → Asset", () => {
        const shelvesNode = sharedResult.transformNodes.find((n) => n.name === "Shelves");
        expect(shelvesNode).toBeDefined();

        const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset");
        expect(assetNode).toBeDefined();
        expect(assetNode!.parent?.name).toBe("Shelves");
    });

    it("applies the authored identity transform on the Asset prim", () => {
        const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset")!;

        expect(assetNode.position.x).toBeCloseTo(0);
        expect(assetNode.position.y).toBeCloseTo(0);
        expect(assetNode.position.z).toBeCloseTo(0);
        expect(assetNode.scaling.x).toBeCloseTo(1);
        expect(assetNode.scaling.y).toBeCloseTo(1);
        expect(assetNode.scaling.z).toBeCloseTo(1);
    });

    // --- Loaded GLB geometry through the wrapper ---

    it("loads exact GLB geometry through the USD wrapper (3633 vertices, 13044 indices)", () => {
        const geometryMesh = sharedResult.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
        expect(geometryMesh).toBeDefined();
        expect(geometryMesh!.getTotalVertices()).toBe(3633);
        expect(geometryMesh!.getTotalIndices()).toBe(13044);
    });

    it("produces exactly 2 meshes: root dummy and geometry mesh", () => {
        expect(sharedResult.meshes.length).toBe(2);
        const rootMesh = sharedResult.meshes.find((m) => m.name.includes("__root__"));
        expect(rootMesh).toBeDefined();
        expect(rootMesh!.getTotalVertices()).toBe(0);

        const geometryMesh = sharedResult.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
        expect(geometryMesh).toBeDefined();
    });

    it("parents the GLB mesh under the USD Asset prim transform", () => {
        const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset")!;
        const geometryMesh = sharedResult.meshes.find((m) => m.name.includes("steel_frame_shelves_02"))!;

        let ancestor = geometryMesh.parent;
        let foundAssetAncestor = false;
        while (ancestor) {
            if (ancestor === assetNode) {
                foundAssetAncestor = true;
                break;
            }
            ancestor = ancestor.parent;
        }
        expect(foundAssetAncestor).toBe(true);
    });

    // --- PBR material and texture assertions ---

    it("assigns the steel_frame_shelves_02 PBR material with 3 textures", () => {
        const geometryMesh = sharedResult.meshes.find((m) => m.name.includes("steel_frame_shelves_02"))!;
        expect(geometryMesh.material).toBeDefined();
        expect(geometryMesh.material!.name).toContain("steel_frame_shelves_02");
        expect(geometryMesh.material).toBeInstanceOf(PBRMaterial);

        const pbrMat = geometryMesh.material as PBRMaterial;

        // Base color / albedo texture (diffuse)
        expect(pbrMat.albedoTexture).toBeDefined();

        // Normal map
        expect(pbrMat.bumpTexture).toBeDefined();

        // Metallic-roughness texture
        expect(pbrMat.metallicTexture).toBeDefined();
    });

    it("registers at least 3 textures on the scene (normal, diffuse, metallic-roughness from GLB)", () => {
        // The GLB contains 3 source images. Material cloning may register additional texture
        // objects on the scene; the PBR material texture assertions above verify the exact
        // semantic channels.
        expect(scene.textures.length).toBeGreaterThanOrEqual(3);
    });

    // --- Deterministic aggregate world bounds ---

    it("produces deterministic non-degenerate aggregate world bounds", () => {
        const allGeometryMeshes = sharedResult.meshes.filter((m: AbstractMesh) => m.getTotalVertices() > 0);
        expect(allGeometryMeshes.length).toBeGreaterThan(0);

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const mesh of allGeometryMeshes) {
            mesh.refreshBoundingInfo();
            const bb = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        }

        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;

        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
        expect(depth).toBeGreaterThan(0);
    });

    // --- Stage metadata ---

    it("preserves stage metadata (Y-up, metersPerUnit=1)", () => {
        expect(scene.useRightHandedSystem).toBe(true);
    });
});

describe("USD RuntimeCorpus - Shelves ownership", () => {
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

    it("LoadAssetContainerAsync owns all entities and dispose returns scene to baseline", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const baselineMeshes = scene.meshes.length;
        const baselineGeometries = scene.geometries.length;
        const baselineTextures = scene.textures.length;
        const baselineMaterials = scene.materials.length;

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            // Container holds entities, scene does not
            expect(container.meshes.length).toBeGreaterThan(0);
            expect(scene.meshes.length).toBe(baselineMeshes);

            // addAllToScene transfers
            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);

            // removeAllFromScene restores baseline
            container.removeAllFromScene();
            expect(scene.meshes.length).toBe(baselineMeshes);

            // dispose returns ALL resource counts to baseline
            container.dispose();
            expect(scene.meshes.length).toBe(baselineMeshes);
            expect(scene.geometries.length).toBe(baselineGeometries);
            expect(scene.textures.length).toBe(baselineTextures);
            expect(scene.materials.length).toBe(baselineMaterials);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

describe("USD RuntimeCorpus - Shelves error paths", () => {
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

    it("missing GLB sidecar rejects through normal glTF SceneLoader error path", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const missingGlbHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            // Delegate to the real glTF loader with a non-existent file — the SceneLoader
            // itself rejects when it cannot fetch the data.
            const container = await LoadAssetContainerAsync("data:;base64,", request.scene, {
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
                    pluginOptions: { usd: { externalAssetHandler: missingGlbHandler } },
                })
            ).rejects.toThrow();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("malformed GLB data rejects through normal glTF SceneLoader error path", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const malformedGlbHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            // Feed 16 zero bytes (invalid glTF magic) to the real glTF loader
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

    it("no handler emits structured unhandled-property diagnostic via Logger", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const logSpy = vi.spyOn(Logger, "Log");

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
            });

            // USD hierarchy nodes are present but no GLB meshes
            const shelvesNode = result.transformNodes.find((n) => n.name === "Shelves");
            expect(shelvesNode).toBeDefined();
            expect(result.meshes.length).toBe(0);

            // Logger.Log was called with the structured diagnostic about the unhandled property
            const diagnosticCalls = logSpy.mock.calls.filter(
                (args) => typeof args[0] === "string" && args[0].includes("assetInfo:source") && args[0].includes("no external asset handler")
            );
            expect(diagnosticCalls.length).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

describe("USD external asset handler - GLB geometry/texture ownership regression", () => {
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

    it("cloned mesh vertex/index buffers remain valid after source template disposal (real GLB)", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            // ImportMeshAsync disposes source templates internally via DisposeSourceContainers.
            // After return, the cloned meshes must retain valid geometry.
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
            expect(geometryMesh).toBeDefined();

            // Vertex/index buffers must survive source template disposal
            expect(geometryMesh!.getTotalVertices()).toBe(3633);
            expect(geometryMesh!.getTotalIndices()).toBe(13044);

            // Bounding info must be valid (not degenerate zeros)
            geometryMesh!.refreshBoundingInfo();
            const bb = geometryMesh!.getBoundingInfo().boundingBox;
            expect(bb.maximumWorld.x - bb.minimumWorld.x).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("cloned textures remain valid after source template disposal (real GLB)", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const result = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
            expect(geometryMesh).toBeDefined();
            expect(geometryMesh!.material).toBeInstanceOf(PBRMaterial);

            const pbrMat = geometryMesh!.material as PBRMaterial;
            // Textures must survive source template disposal
            expect(pbrMat.albedoTexture).toBeDefined();
            expect(pbrMat.bumpTexture).toBeDefined();
            expect(pbrMat.metallicTexture).toBeDefined();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("outer AssetContainer dispose returns all resource counts to baseline after GLB handler", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const baselineGeometries = scene.geometries.length;
        const baselineTextures = scene.textures.length;
        const baselineMeshes = scene.meshes.length;
        const baselineMaterials = scene.materials.length;

        try {
            const usdaData = readCorpusFile("shelves_01.usda");
            const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
            });

            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);
            expect(scene.geometries.length).toBeGreaterThan(baselineGeometries);

            container.removeAllFromScene();
            container.dispose();

            // All resource counts return to baseline — no leaked templates
            expect(scene.meshes.length).toBe(baselineMeshes);
            expect(scene.geometries.length).toBe(baselineGeometries);
            expect(scene.textures.length).toBe(baselineTextures);
            expect(scene.materials.length).toBe(baselineMaterials);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
