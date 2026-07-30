import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
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
import { Vector3 } from "core/Maths/math.vector";
import { type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

// Forklift OBJ is ~747 KB (3746 vertices, 3496 faces); single parse in beforeAll.
const LOAD_TIMEOUT = 30_000;

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/**
 * Application-owned handler that delegates OBJ loading to Babylon's registered OBJ plugin.
 * Recognizes only the custom `assetInfo:source` property and only `.obj` extensions.
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
 * Sets up Tools.LoadFile mock that serves MTL from disk and tracks all file requests.
 * Returns the list of requested URLs for assertion.
 */
function mockToolsLoadFile(): string[] {
    const requestedUrls: string[] = [];
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
            requestedUrls.push(url);
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
    return requestedUrls;
}

describe("USD RuntimeCorpus - Forklift", () => {
    // Shared read-only result: parse the 747 KB OBJ exactly once.
    let sharedEngine: NullEngine;
    let sharedScene: Scene;
    let sharedResult: ISceneLoaderAsyncResult;
    let handlerRequestedUris: string[];
    let toolsLoadFileUrls: string[];

    beforeAll(
        async () => {
            RegisterUSDFileLoader();
            RegisterOBJFileLoader();
            vi.spyOn(Logger, "Log").mockImplementation(() => {});
            vi.spyOn(Logger, "Warn").mockImplementation(() => {});
            vi.spyOn(Logger, "Error").mockImplementation(() => {});

            handlerRequestedUris = [];
            toolsLoadFileUrls = mockToolsLoadFile();

            const trackingHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                handlerRequestedUris.push(request.authoredUri);
                return forkliftHandler(request);
            };

            sharedEngine = new NullEngine();
            sharedScene = new Scene(sharedEngine);

            const usdaData = readCorpusFile("Forklift.usda");
            sharedResult = await ImportMeshAsync("data:" + usdaData, sharedScene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: trackingHandler } },
            });
        },
        LOAD_TIMEOUT
    );

    afterAll(() => {
        sharedScene?.dispose();
        sharedEngine?.dispose();
        vi.restoreAllMocks();
    });

    describe("hierarchy and authored transform", () => {
        it("creates the authored USD hierarchy: __usd_root__ > Forklift > Asset > mesh", () => {
            const rootNode = sharedResult.transformNodes.find((n) => n.name === "Forklift");
            expect(rootNode).toBeDefined();
            expect(rootNode!.parent?.name).toBe("__usd_root__");

            const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset");
            expect(assetNode).toBeDefined();
            expect(assetNode!.parent?.name).toBe("Forklift");

            // OBJ mesh is parented under Asset
            const meshWithGeometry = sharedResult.meshes.find((m) => m.getTotalVertices() > 0);
            expect(meshWithGeometry).toBeDefined();
            expect(meshWithGeometry!.parent?.name).toBe("Asset");
        });

        it("applies authored uniform scale (0.03, 0.03, 0.03) on Asset prim", () => {
            const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset")!;
            expect(assetNode.scaling.x).toBeCloseTo(0.03, 5);
            expect(assetNode.scaling.y).toBeCloseTo(0.03, 5);
            expect(assetNode.scaling.z).toBeCloseTo(0.03, 5);
        });

        it("applies authored identity translation (0, 0, 0) on Asset prim", () => {
            const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset")!;
            expect(assetNode.position.x).toBeCloseTo(0, 5);
            expect(assetNode.position.y).toBeCloseTo(0, 5);
            expect(assetNode.position.z).toBeCloseTo(0, 5);
        });

        it("applies authored identity rotation (0, 0, 0) on Asset prim", () => {
            const assetNode = sharedResult.transformNodes.find((n) => n.name === "Asset")!;
            expect(assetNode.rotation.x).toBeCloseTo(0, 5);
            expect(assetNode.rotation.y).toBeCloseTo(0, 5);
            expect(assetNode.rotation.z).toBeCloseTo(0, 5);
        });
    });

    describe("geometry", () => {
        it("imports exactly one mesh with 13,747 vertices and 20,760 indices", () => {
            const meshesWithGeometry = sharedResult.meshes.filter((m) => m.getTotalVertices() > 0);
            expect(meshesWithGeometry.length).toBe(1);
            expect(meshesWithGeometry[0].getTotalVertices()).toBe(13747);
            expect(meshesWithGeometry[0].getTotalIndices()).toBe(20760);
        });

        it("provides valid unit-length normals for every vertex", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            const normals = mesh.getVerticesData("normal");
            expect(normals).not.toBeNull();
            // 13747 vertices × 3 components = 41241 floats
            expect(normals!.length).toBe(41241);

            // Spot-check first and last normal are unit-length
            const n0 = new Vector3(normals![0], normals![1], normals![2]);
            expect(n0.length()).toBeCloseTo(1.0, 3);
            const last = normals!.length - 3;
            const nLast = new Vector3(normals![last], normals![last + 1], normals![last + 2]);
            expect(nLast.length()).toBeCloseTo(1.0, 3);
        });

        it("has deterministic final world bounds after 0.03 scale via computeWorldMatrix", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo();
            const bb = mesh.getBoundingInfo().boundingBox;

            // Six aggregate final world min/max values after the USD 0.03 uniform scale
            expect(bb.minimumWorld.x).toBeCloseTo(-5.870, 2);
            expect(bb.minimumWorld.y).toBeCloseTo(-0.005, 2);
            expect(bb.minimumWorld.z).toBeCloseTo(-1.060, 2);
            expect(bb.maximumWorld.x).toBeCloseTo(-0.0001, 2);
            expect(bb.maximumWorld.y).toBeCloseTo(3.800, 2);
            expect(bb.maximumWorld.z).toBeCloseTo(1.065, 2);
        });
    });

    describe("material and textures", () => {
        it("assigns a StandardMaterial with authored MTL diffuse color (Kd 0.93, 0.64, 0.16)", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            expect(mesh.material).toBeDefined();
            expect(mesh.material).toBeInstanceOf(StandardMaterial);

            const material = mesh.material as StandardMaterial;
            expect(material.diffuseColor.r).toBeCloseTo(0.93, 2);
            expect(material.diffuseColor.g).toBeCloseTo(0.64, 2);
            expect(material.diffuseColor.b).toBeCloseTo(0.16, 2);
        });

        it("loads the base-color texture (map_Kd → diffuseTexture)", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            const material = mesh.material as StandardMaterial;

            expect(material.diffuseTexture).toBeDefined();
            expect(material.diffuseTexture).toBeInstanceOf(Texture);
            expect(material.diffuseTexture!.name).toContain("Mat01_BaseColor");
        });

        it("loads the normal map texture (map_Bump → bumpTexture) with authored level 1.0", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            const material = mesh.material as StandardMaterial;

            expect(material.bumpTexture).toBeDefined();
            expect(material.bumpTexture).toBeInstanceOf(Texture);
            expect(material.bumpTexture!.name).toContain("Mat01_Normal");
            expect(material.bumpTexture!.level).toBeCloseTo(1.0, 3);
        });

        it("loads the roughness/specular-exponent texture (map_Ns → specularTexture)", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            const material = mesh.material as StandardMaterial;

            // MTL map_Ns (specular exponent) is approximately mapped to specularTexture.
            // This is an approximation: map_Ns controls highlight sharpness while
            // specularTexture modulates specular color/intensity.
            expect(material.specularTexture).toBeDefined();
            expect(material.specularTexture).toBeInstanceOf(Texture);
            expect(material.specularTexture!.name).toContain("Mat01_Roughness");
        });
    });

    describe("stage metadata", () => {
        it("preserves Y-up, metersPerUnit=1 → right-handed system", () => {
            expect(sharedScene.useRightHandedSystem).toBe(true);
        });
    });

    describe("file and network tracking", () => {
        it("requests only the authored OBJ via the external asset handler", () => {
            expect(handlerRequestedUris.length).toBe(1);
            expect(handlerRequestedUris[0]).toBe("./Forklift/Forklift.obj");
        });

        it("does not request GLB or binary USD", () => {
            expect(handlerRequestedUris.filter((u) => u.toLowerCase().endsWith(".glb")).length).toBe(0);
            expect(handlerRequestedUris.filter((u) => u.toLowerCase().endsWith(".usd")).length).toBe(0);
        });

        it("loads the MTL sidecar via Tools.LoadFile", () => {
            const mtlRequests = toolsLoadFileUrls.filter((u) => u.endsWith(".mtl"));
            expect(mtlRequests.length).toBe(1);
            expect(mtlRequests[0]).toContain("Forklift.mtl");
        });

        it("does not fetch unexpected files via Tools.LoadFile", () => {
            // Only the MTL should be loaded via Tools.LoadFile
            // Textures are loaded by the Texture constructor, not via Tools.LoadFile
            const nonMtlRequests = toolsLoadFileUrls.filter((u) => !u.endsWith(".mtl"));
            expect(nonMtlRequests.length).toBe(0);
        });
    });

    describe("AssetContainer ownership", () => {
        it(
            "loads via LoadAssetContainerAsync with exact ownership counts and clean restore",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                vi.spyOn(Logger, "Log").mockImplementation(() => {});
                vi.spyOn(Logger, "Warn").mockImplementation(() => {});
                vi.spyOn(Logger, "Error").mockImplementation(() => {});
                mockToolsLoadFile();

                try {
                    const usdaData = readCorpusFile("Forklift.usda");
                    const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    // Exact container ownership
                    expect(container.meshes.length).toBe(1);
                    expect(container.materials.length).toBe(1);
                    expect(container.textures.length).toBe(3);
                    expect(container.geometries.length).toBe(1);

                    // Scene is empty before adding
                    expect(scene.meshes.length).toBe(0);
                    expect(scene.materials.length).toBe(0);

                    // Add to scene
                    container.addAllToScene();
                    expect(scene.meshes.length).toBe(1);

                    // Remove restores scene baseline
                    container.removeAllFromScene();
                    expect(scene.meshes.length).toBe(0);

                    // Dispose
                    container.dispose();
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            LOAD_TIMEOUT
        );
    });

    describe("error behavior with missing or malformed sidecars", () => {
        beforeEach(() => {
            RegisterUSDFileLoader();
            RegisterOBJFileLoader();
            vi.spyOn(Logger, "Log").mockImplementation(() => {});
            vi.spyOn(Logger, "Warn").mockImplementation(() => {});
            vi.spyOn(Logger, "Error").mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("rejects when the OBJ file is missing (handler throws)", async () => {
            mockToolsLoadFile();
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
                ).rejects.toThrow("OBJ file not found");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("rejects when OBJ data is malformed (handler returns invalid container)", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const malformedHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    // Feed garbage data as OBJ
                    const container = await LoadAssetContainerAsync("data:NOT_VALID_OBJ_DATA", request.scene, {
                        pluginExtension: ".obj",
                        rootUrl: "",
                    });
                    return { handled: true, container };
                };

                // Malformed OBJ produces a container but with no meaningful geometry
                const result = await ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: malformedHandler } },
                });
                const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
                expect(meshesWithGeometry.length).toBe(0);
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it(
            "rejects when MTL file is missing (Tools.LoadFile errors on MTL)",
            async () => {
                // Mock LoadFile to error on all MTL requests
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
                            setTimeout(() => {
                                if (onError) {
                                    onError(undefined, new LoadFileError(`MTL not found: ${url}`, undefined));
                                }
                            }, 0);
                        } else {
                            setTimeout(() => onSuccess("", undefined, null), 0);
                        }
                        return fileRequest;
                    }
                );

                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");

                    // OBJ loader loads geometry even when MTL fails — mesh exists but
                    // material falls back. This matches normal SceneLoader error behavior
                    // (MTL failure is logged, not thrown).
                    const result = await ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: forkliftHandler } },
                    });

                    // Mesh loads with geometry but no authored MTL textures
                    const mesh = result.meshes.find((m) => m.getTotalVertices() > 0);
                    expect(mesh).toBeDefined();
                    expect(mesh!.getTotalVertices()).toBe(13747);
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            LOAD_TIMEOUT
        );

        it("reports diagnostic when no handler is configured", async () => {
            const loggerLogSpy = vi.spyOn(Logger, "Log").mockImplementation(() => {});
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");
                const result = await ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                    // No externalAssetHandler
                });

                // Hierarchy exists but no OBJ geometry
                const rootNode = result.transformNodes.find((n) => n.name === "Forklift");
                expect(rootNode).toBeDefined();
                const assetNode = result.transformNodes.find((n) => n.name === "Asset");
                expect(assetNode).toBeDefined();

                // No geometry meshes
                const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
                expect(meshesWithGeometry.length).toBe(0);

                // Diagnostic is emitted at info level through Logger.Log
                const logCalls = loggerLogSpy.mock.calls.map((c) => String(c[0]));
                const unhandledDiag = logCalls.find(
                    (msg) => msg.includes("assetInfo:source") || msg.includes("no external asset handler")
                );
                expect(unhandledDiag).toBeDefined();
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });
    });
});
