import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "core/Meshes/instancedMesh";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync, LoadAssetContainerAsync, type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { RegisterGLTFFileLoader } from "loaders/glTF/glTFFileLoader.pure";
import { RegisterGLTF2Loader } from "loaders/glTF/2.0/glTFLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

// Cache the GLB base64 — the file is ~54 MB; avoid repeated disk reads/encodes.
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
 * @param request external asset request emitted for an authored USD property
 * @returns the handled GLB container or an unhandled result for other properties
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

// ─── Shared public wrapper load ──────────────────────────────────────────────
// One beforeAll ImportMeshAsync through the public SceneLoader seam, exercising
// the full USD→handler→glTF→clone→dispose cycle. All read-only assertions in
// the main describe share this result to avoid re-parsing the 54 MB GLB.

describe("USD RuntimeCorpus - Shelves", () => {
    let engine: NullEngine;
    let scene: Scene;
    let result: ISceneLoaderAsyncResult;

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
        result = await ImportMeshAsync("data:" + usdaData, scene, {
            pluginExtension: ".usda",
            pluginOptions: { usd: { externalAssetHandler: shelvesHandler } },
        });
    });

    afterAll(() => {
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    // ── Authored USD hierarchy and transform ──

    it("creates the authored USD hierarchy: Shelves → Asset", () => {
        const shelvesNode = result.transformNodes.find((n) => n.name === "Shelves");
        expect(shelvesNode).toBeDefined();

        const assetNode = result.transformNodes.find((n) => n.name === "Asset");
        expect(assetNode).toBeDefined();
        expect(assetNode!.parent?.name).toBe("Shelves");
    });

    it("applies the authored identity transform (position, rotation, scale)", () => {
        const assetNode = result.transformNodes.find((n) => n.name === "Asset")!;

        // Identity position
        expect(assetNode.position.x).toBeCloseTo(0);
        expect(assetNode.position.y).toBeCloseTo(0);
        expect(assetNode.position.z).toBeCloseTo(0);

        // Identity rotation (euler)
        expect(assetNode.rotation.x).toBeCloseTo(0);
        expect(assetNode.rotation.y).toBeCloseTo(0);
        expect(assetNode.rotation.z).toBeCloseTo(0);

        // Identity scale
        expect(assetNode.scaling.x).toBeCloseTo(1);
        expect(assetNode.scaling.y).toBeCloseTo(1);
        expect(assetNode.scaling.z).toBeCloseTo(1);
    });

    // ── Loaded GLB geometry through the wrapper ──

    it("loads exact GLB geometry through the USD wrapper: 3633 vertices, 13044 indices", () => {
        const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"));
        expect(geometryMesh).toBeDefined();
        expect(geometryMesh!.getTotalVertices()).toBe(3633);
        expect(geometryMesh!.getTotalIndices()).toBe(13044);
    });

    it("produces exactly 2 meshes: root dummy and geometry mesh", () => {
        expect(result.meshes.length).toBe(2);
        const rootMesh = result.meshes.find((m) => m.name.includes("__root__"));
        expect(rootMesh).toBeDefined();
        expect(rootMesh!.getTotalVertices()).toBe(0);
    });

    it("parents the GLB mesh under the USD Asset prim transform", () => {
        const assetNode = result.transformNodes.find((n) => n.name === "Asset")!;
        const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"))!;

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

    it("geometry mesh has identity rotation quaternion", () => {
        const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"))!;
        const rq = geometryMesh.rotationQuaternion;
        expect(rq).not.toBeNull();
        expect(rq!.x).toBeCloseTo(0);
        expect(rq!.y).toBeCloseTo(0);
        expect(rq!.z).toBeCloseTo(0);
        expect(rq!.w).toBeCloseTo(1);
    });

    // ── PBR material and texture assertions ──

    it("assigns the steel_frame_shelves_02 PBR material with exact texture channels", () => {
        const geometryMesh = result.meshes.find((m) => m.name.includes("steel_frame_shelves_02"))!;
        expect(geometryMesh.material).toBeDefined();
        expect(geometryMesh.material!.name).toBe("Clone of steel_frame_shelves_02");
        expect(geometryMesh.material).toBeInstanceOf(PBRMaterial);

        const pbrMat = geometryMesh.material as PBRMaterial;

        // Base color / albedo texture
        expect(pbrMat.albedoTexture).toBeDefined();
        expect(pbrMat.albedoTexture!.name).toBe("steel_frame_shelves_02 (Base Color)");

        // Normal map
        expect(pbrMat.bumpTexture).toBeDefined();
        expect(pbrMat.bumpTexture!.name).toBe("steel_frame_shelves_02 (Normal)");

        // Metallic-roughness texture
        expect(pbrMat.metallicTexture).toBeDefined();
        expect(pbrMat.metallicTexture!.name).toBe("steel_frame_shelves_02 (Metallic Roughness)");
    });

    // ── Exact deterministic aggregate world bounds ──

    it("produces exact deterministic aggregate world bounds across all geometry", () => {
        const allGeometryMeshes = result.meshes.filter((m: AbstractMesh) => m.getTotalVertices() > 0);
        expect(allGeometryMeshes.length).toBe(1);

        const mesh = allGeometryMeshes[0];
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo();
        const bb = mesh.getBoundingInfo().boundingBox;

        // Exact aggregate min/max from the committed GLB geometry
        expect(bb.minimumWorld.x).toBeCloseTo(-0.2967, 3);
        expect(bb.minimumWorld.y).toBeCloseTo(-0.0011, 3);
        expect(bb.minimumWorld.z).toBeCloseTo(-0.2512, 3);
        expect(bb.maximumWorld.x).toBeCloseTo(0.2967, 3);
        expect(bb.maximumWorld.y).toBeCloseTo(2.1405, 3);
        expect(bb.maximumWorld.z).toBeCloseTo(0.2512, 3);
    });

    // ── Stage metadata ──

    it("preserves stage metadata (Y-up, metersPerUnit=1)", () => {
        expect(scene.useRightHandedSystem).toBe(true);
    });
});

// ─── Ownership lifecycle ─────────────────────────────────────────────────────

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

    it("LoadAssetContainerAsync: container categories nonempty, removeAll restores all baselines, dispose clears all owned", async () => {
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

            // Container holds entities in every category
            expect(container.meshes.length).toBeGreaterThan(0);
            expect(container.materials.length).toBeGreaterThan(0);
            expect(container.geometries.length).toBeGreaterThan(0);
            expect(container.textures.length).toBeGreaterThan(0);

            // Scene is empty before addAllToScene
            expect(scene.meshes.length).toBe(baselineMeshes);

            // addAllToScene transfers all categories to the scene
            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);
            expect(scene.materials.length).toBeGreaterThan(baselineMaterials);
            expect(scene.geometries.length).toBeGreaterThan(baselineGeometries);
            expect(scene.textures.length).toBeGreaterThan(baselineTextures);

            // removeAllFromScene restores all four baselines
            container.removeAllFromScene();
            expect(scene.meshes.length).toBe(baselineMeshes);
            expect(scene.geometries.length).toBe(baselineGeometries);
            expect(scene.textures.length).toBe(baselineTextures);
            expect(scene.materials.length).toBe(baselineMaterials);

            // dispose clears every owned category on the container
            container.dispose();
            expect(container.meshes.length).toBe(0);
            expect(container.materials.length).toBe(0);
            expect(container.geometries.length).toBe(0);
            expect(container.textures.length).toBe(0);
            expect(container.transformNodes.length).toBe(0);

            // Scene remains at baseline after dispose
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

// ─── Error paths ─────────────────────────────────────────────────────────────

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

    it("genuinely absent GLB sidecar rejects through handler path prevalidation", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // Synthetic USDA referencing a GLB that does not exist in the corpus
        const missingGlbUsda = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Xform "Asset"
    {
        custom asset assetInfo:source = @./Missing.glb@
        double3 xformOp:translate = (0, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`;

        // Handler that prevalidates the resolved path against known corpus files
        const knownCorpusFiles = new Set(["shelves_01.glb"]);
        const prevalidatingHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            if (request.propertyName !== "assetInfo:source") {
                return { handled: false };
            }
            const fileName = request.authoredUri.replace(/^\.\//, "");
            if (!knownCorpusFiles.has(fileName)) {
                throw new Error(`Missing sidecar: '${request.authoredUri}' not found (resolved '${request.resolvedUri}')`);
            }
            const glbBase64 = getGlbBase64();
            const container = await LoadAssetContainerAsync("data:;base64," + glbBase64, request.scene, {
                pluginExtension: ".glb",
                rootUrl: "",
            });
            return { handled: true, container };
        };

        try {
            await expect(
                ImportMeshAsync("data:" + missingGlbUsda, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: prevalidatingHandler } },
                })
            ).rejects.toThrow("Missing sidecar");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("malformed GLB (invalid magic) rejects through normal glTF SceneLoader error path", async () => {
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
            const noHandlerResult = await ImportMeshAsync("data:" + usdaData, scene, {
                pluginExtension: ".usda",
            });

            // USD hierarchy nodes present, no GLB meshes
            const shelvesNode = noHandlerResult.transformNodes.find((n) => n.name === "Shelves");
            expect(shelvesNode).toBeDefined();
            expect(noHandlerResult.meshes.length).toBe(0);

            // Structured diagnostic: Logger.Log called with assetInfo:source + no handler message
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
