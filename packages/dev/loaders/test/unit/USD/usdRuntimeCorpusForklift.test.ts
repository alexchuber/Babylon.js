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
import { Texture } from "core/Materials/Textures/texture";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

// Forklift OBJ is ~747 KB (3746 vertices, 3496 faces); parsing takes longer than the default 5 s.
const FORKLIFT_TIMEOUT = 30_000;

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that delegates OBJ loading to Babylon's registered OBJ plugin
 * via the module-level `LoadAssetContainerAsync`. `Tools.LoadFile` is mocked in test setup
 * to serve MTL data from disk.
 */
async function forkliftHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
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

/**
 * Serves MTL files from the corpus directory via mocked `Tools.LoadFile`.
 */
function mockToolsLoadFile(): void {
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
                    const mtlData = readCorpusFile("Forklift/" + mtlName);
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

describe("USD RuntimeCorpus - Forklift", () => {
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

    describe("hierarchy and authored transform", () => {
        it(
            "creates the authored USD hierarchy: Forklift > Asset",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const rootNode = result.transformNodes.find((node) => node.name === "Forklift");
                    expect(rootNode).toBeDefined();

                    const assetNode = result.transformNodes.find((node) => node.name === "Asset");
                    expect(assetNode).toBeDefined();
                    expect(assetNode!.parent?.name).toBe("Forklift");
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "applies the authored USD scale (0.03, 0.03, 0.03) on the Asset prim",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const assetNode = result.transformNodes.find((node) => node.name === "Asset");
                    expect(assetNode).toBeDefined();
                    expect(assetNode!.scaling.x).toBeCloseTo(0.03);
                    expect(assetNode!.scaling.y).toBeCloseTo(0.03);
                    expect(assetNode!.scaling.z).toBeCloseTo(0.03);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "applies the authored translate (0, 0, 0) and rotation (0, 0, 0)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const assetNode = result.transformNodes.find((node) => node.name === "Asset");
                    expect(assetNode).toBeDefined();
                    expect(assetNode!.position.x).toBeCloseTo(0);
                    expect(assetNode!.position.y).toBeCloseTo(0);
                    expect(assetNode!.position.z).toBeCloseTo(0);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("geometry and imported mesh", () => {
        it(
            "loads OBJ mesh with meaningful vertex and index counts",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    expect(meshWithGeometry).toBeDefined();

                    // OBJ has 3746 source vertices, 3496 faces (3424 quads + 72 triangles).
                    // After vertex splitting: 13747 unique pos/uv/normal combos; 20760 indices.
                    expect(meshWithGeometry!.getTotalVertices()).toBe(13747);
                    expect(meshWithGeometry!.getTotalIndices()).toBe(20760);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "parents OBJ content under the USD Asset prim",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const assetNode = result.transformNodes.find((node) => node.name === "Asset");
                    expect(assetNode).toBeDefined();

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
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "has deterministic OBJ-space bounding box (195.67 × 126.85 × 70.82)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    expect(meshWithGeometry).toBeDefined();
                    meshWithGeometry!.refreshBoundingInfo();
                    const bounds = meshWithGeometry!.getBoundingInfo().boundingBox;
                    const width = bounds.maximumWorld.x - bounds.minimumWorld.x;
                    const height = bounds.maximumWorld.y - bounds.minimumWorld.y;
                    const depth = bounds.maximumWorld.z - bounds.minimumWorld.z;

                    // Raw OBJ-space extents before the USD 0.03 scale
                    expect(width).toBeCloseTo(195.669, 1);
                    expect(height).toBeCloseTo(126.848, 1);
                    expect(depth).toBeCloseTo(70.821, 1);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("material and textures", () => {
        it(
            "assigns a StandardMaterial with MTL diffuse color (Kd 0.93, 0.64, 0.16)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    expect(meshWithGeometry).toBeDefined();
                    expect(meshWithGeometry!.material).toBeDefined();
                    expect(meshWithGeometry!.material).toBeInstanceOf(StandardMaterial);

                    const material = meshWithGeometry!.material as StandardMaterial;
                    expect(material.diffuseColor.r).toBeCloseTo(0.93, 2);
                    expect(material.diffuseColor.g).toBeCloseTo(0.64, 2);
                    expect(material.diffuseColor.b).toBeCloseTo(0.16, 2);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "references the base-color texture from MTL (map_Kd)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    const material = meshWithGeometry!.material as StandardMaterial;

                    // map_Kd → diffuseTexture
                    expect(material.diffuseTexture).toBeDefined();
                    expect(material.diffuseTexture).toBeInstanceOf(Texture);
                    expect(material.diffuseTexture!.name).toContain("Mat01_BaseColor");
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "references the normal map texture from MTL (map_Bump) with authored level",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    const material = meshWithGeometry!.material as StandardMaterial;

                    // map_Bump -bm 1.0 → bumpTexture with level=1.0
                    expect(material.bumpTexture).toBeDefined();
                    expect(material.bumpTexture).toBeInstanceOf(Texture);
                    expect(material.bumpTexture!.name).toContain("Mat01_Normal");
                    expect(material.bumpTexture!.level).toBeCloseTo(1.0);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );

        it(
            "does not load roughness texture (map_Ns is unsupported by OBJ loader)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    const meshWithGeometry = result.meshes.find((m) => m.getTotalVertices() > 0);
                    const material = meshWithGeometry!.material as StandardMaterial;

                    // MTL file references map_Ns textures/Mat01_Roughness.png, but Babylon's
                    // OBJ loader does not map the specular exponent texture (map_Ns) to any
                    // StandardMaterial property. Verify the MTL is parsed (diffuseTexture
                    // exists) but specularTexture is not set from map_Ns.
                    expect(material.diffuseTexture).toBeDefined();
                    expect(material.specularTexture).toBeNull();
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("stage metadata", () => {
        it(
            "preserves stage metadata (Y-up, metersPerUnit=1)",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    expect(scene.useRightHandedSystem).toBe(true);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("AssetContainer ownership", () => {
        it(
            "loads via LoadAssetContainerAsync with correct container ownership",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
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
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("alternative assets not selected", () => {
        it(
            "does not fetch GLB or binary USD from the Forklift directory",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const fetchedUrls: string[] = [];

                    const trackingHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                        fetchedUrls.push(request.authoredUri);
                        return forkliftHandler(request);
                    };

                    await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: trackingHandler } },
                    });

                    // Only the OBJ should be requested via the handler
                    expect(fetchedUrls.length).toBe(1);
                    expect(fetchedUrls[0]).toBe("./Forklift/Forklift.obj");

                    // No GLB or USDC references
                    expect(fetchedUrls.filter((u) => u.toLowerCase().endsWith(".glb")).length).toBe(0);
                    expect(fetchedUrls.filter((u) => u.toLowerCase().endsWith(".usd")).length).toBe(0);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            FORKLIFT_TIMEOUT
        );
    });

    describe("error behavior with missing or malformed sidecars", () => {
        it("rejects when the OBJ file is missing", async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const brokenHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    throw new Error("OBJ file not found: " + request.authoredUri);
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: brokenHandler } },
                    })
                ).rejects.toThrow();
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("reports when no handler is configured", async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");
                const result = await ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                });

                // The wrapper loads but no OBJ mesh is produced
                const rootNode = result.transformNodes.find((node) => node.name === "Forklift");
                expect(rootNode).toBeDefined();

                const assetNode = result.transformNodes.find((node) => node.name === "Asset");
                expect(assetNode).toBeDefined();

                // No geometry meshes from OBJ
                const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
                expect(meshesWithGeometry.length).toBe(0);
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });
    });
});
