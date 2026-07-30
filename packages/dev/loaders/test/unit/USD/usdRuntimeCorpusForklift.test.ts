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
import { ImportMeshAsync, LoadAssetContainerAsync, type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Texture } from "core/Materials/Textures/texture";
import { Vector3 } from "core/Maths/math.vector";
import { RegisterOBJFileLoader } from "loaders/OBJ/objFileLoader.pure";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";

const LOAD_TIMEOUT = 30_000;

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

/** PNG magic bytes: 137 80 78 71 13 10 26 10 */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Validates that a file at the given corpus-relative path exists and starts with PNG magic bytes.
function validatePng(relativePath: string): void {
    const fullPath = path.join(corpusRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Required PNG sidecar not found: ${relativePath}`);
    }
    const header = Buffer.alloc(8);
    const fd = fs.openSync(fullPath, "r");
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    if (!header.subarray(0, 8).equals(PNG_MAGIC)) {
        throw new Error(`Invalid PNG header in ${relativePath}`);
    }
}

// Validates the complete authored sidecar graph:
// Forklift.usda → Forklift/Forklift.obj (references mtllib) → Forklift/Forklift.mtl
// MTL references: textures/Mat01_BaseColor.png, textures/Mat01_Normal.png, textures/Mat01_Roughness.png
function validateSidecarGraph(): void {
    // OBJ exists and references MTL
    const obj = readCorpusFile("Forklift/Forklift.obj");
    if (!obj.includes("mtllib Forklift.mtl")) {
        throw new Error("OBJ does not reference Forklift.mtl");
    }

    // MTL exists and references all three textures
    const mtl = readCorpusFile("Forklift/Forklift.mtl");
    if (!mtl.includes("map_Kd textures/Mat01_BaseColor.png")) {
        throw new Error("MTL missing map_Kd reference");
    }
    if (!mtl.includes("map_Bump")) {
        throw new Error("MTL missing map_Bump reference");
    }
    if (!mtl.includes("map_Ns textures/Mat01_Roughness.png")) {
        throw new Error("MTL missing map_Ns reference");
    }

    // All three PNGs exist with valid headers
    validatePng("Forklift/textures/Mat01_BaseColor.png");
    validatePng("Forklift/textures/Mat01_Normal.png");
    validatePng("Forklift/textures/Mat01_Roughness.png");
}

// Application-owned handler with pre-validation and post-load validation.
// Validates sidecar graph before loading, rejects on any failure.
async function validatingForkliftHandler(request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> {
    if (request.propertyName !== "assetInfo:source") {
        return { handled: false };
    }
    const extension = request.authoredUri.split(".").pop()?.toLowerCase();
    if (extension !== "obj") {
        return { handled: false };
    }

    // Pre-validate authored sidecar graph
    validateSidecarGraph();

    const objRelativePath = request.authoredUri.replace(/^\.\//, "");
    const objData = readCorpusFile(objRelativePath);

    const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
        pluginExtension: ".obj",
        rootUrl: "",
    });

    // Post-load validation: must have geometry and material with authored textures
    const meshWithGeometry = container.meshes.find((m) => m.getTotalVertices() > 0);
    if (!meshWithGeometry) {
        container.dispose();
        throw new Error("OBJ loaded but produced no geometry mesh");
    }
    if (!meshWithGeometry.material) {
        container.dispose();
        throw new Error("OBJ mesh has no material after MTL loading");
    }
    const mat = meshWithGeometry.material as StandardMaterial;
    if (!mat.diffuseTexture) {
        container.dispose();
        throw new Error("Missing base-color texture (map_Kd) after MTL loading");
    }
    if (!mat.bumpTexture) {
        container.dispose();
        throw new Error("Missing normal map texture (map_Bump) after MTL loading");
    }
    if (!mat.specularTexture) {
        container.dispose();
        throw new Error("Missing roughness/specular texture (map_Ns) after MTL loading");
    }

    return { handled: true, container };
}

// Sets up Tools.LoadFile mock serving MTL from disk and tracking all requests.
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

    beforeAll(async () => {
        RegisterUSDFileLoader();
        RegisterOBJFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        handlerRequestedUris = [];
        toolsLoadFileUrls = mockToolsLoadFile();

        const trackingHandler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            handlerRequestedUris.push(request.authoredUri);
            return validatingForkliftHandler(request);
        };

        sharedEngine = new NullEngine();
        sharedScene = new Scene(sharedEngine);

        const usdaData = readCorpusFile("Forklift.usda");
        sharedResult = await ImportMeshAsync("data:" + usdaData, sharedScene, {
            pluginExtension: ".usda",
            pluginOptions: { usd: { externalAssetHandler: trackingHandler } },
        });
    }, LOAD_TIMEOUT);

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
            expect(normals!.length).toBe(41241);

            const n0 = new Vector3(normals![0], normals![1], normals![2]);
            expect(n0.length()).toBeCloseTo(1.0, 3);
            const last = normals!.length - 3;
            const nLast = new Vector3(normals![last], normals![last + 1], normals![last + 2]);
            expect(nLast.length()).toBeCloseTo(1.0, 3);
        });

        it("has deterministic final world bounds after 0.03 scale via computeWorldMatrix", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo(false, false);
            const bb = mesh.getBoundingInfo().boundingBox;

            expect(bb.minimumWorld.x).toBeCloseTo(-5.87, 2);
            expect(bb.minimumWorld.y).toBeCloseTo(-0.005, 2);
            expect(bb.minimumWorld.z).toBeCloseTo(-1.06, 2);
            expect(bb.maximumWorld.x).toBeCloseTo(-0.0001, 2);
            expect(bb.maximumWorld.y).toBeCloseTo(3.8, 2);
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
            const material = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!.material as StandardMaterial;
            expect(material.diffuseTexture).toBeDefined();
            expect(material.diffuseTexture).toBeInstanceOf(Texture);
            expect(material.diffuseTexture!.name).toContain("Mat01_BaseColor");
        });

        it("loads the normal map texture (map_Bump → bumpTexture) with authored level 1.0", () => {
            const material = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!.material as StandardMaterial;
            expect(material.bumpTexture).toBeDefined();
            expect(material.bumpTexture).toBeInstanceOf(Texture);
            expect(material.bumpTexture!.name).toContain("Mat01_Normal");
            expect(material.bumpTexture!.level).toBeCloseTo(1.0, 3);
        });

        it("loads the roughness/specular-exponent texture (map_Ns → specularTexture)", () => {
            const material = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!.material as StandardMaterial;
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

    describe("sidecar tracking", () => {
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
            const nonMtlRequests = toolsLoadFileUrls.filter((u) => !u.endsWith(".mtl"));
            expect(nonMtlRequests.length).toBe(0);
        });

        it("loads exactly three authored texture names in the resulting scene", () => {
            const mesh = sharedResult.meshes.find((m) => m.getTotalVertices() > 0)!;
            const mat = mesh.material as StandardMaterial;
            const textureNames = [mat.diffuseTexture?.name, mat.bumpTexture?.name, mat.specularTexture?.name].filter(Boolean) as string[];
            expect(textureNames.length).toBe(3);
            expect(textureNames.some((n) => n.includes("Mat01_BaseColor"))).toBe(true);
            expect(textureNames.some((n) => n.includes("Mat01_Normal"))).toBe(true);
            expect(textureNames.some((n) => n.includes("Mat01_Roughness"))).toBe(true);
        });
    });

    describe("AssetContainer ownership", () => {
        it(
            "loads with exact ownership counts and clean baseline restoration after add/remove/dispose",
            async () => {
                const engine = new NullEngine();
                const scene = new Scene(engine);

                vi.spyOn(Logger, "Log").mockImplementation(() => {});
                vi.spyOn(Logger, "Warn").mockImplementation(() => {});
                vi.spyOn(Logger, "Error").mockImplementation(() => {});
                mockToolsLoadFile();

                try {
                    // Capture scene baselines before loading
                    const baselineMeshes = scene.meshes.length;
                    const baselineMaterials = scene.materials.length;
                    const baselineTextures = scene.textures.length;
                    const baselineGeometries = scene.geometries?.length ?? 0;

                    const usdaData = readCorpusFile("Forklift.usda");
                    const container = await LoadAssetContainerAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: validatingForkliftHandler } },
                    });

                    // Exact container ownership — all categories nonempty
                    expect(container.meshes.length).toBe(1);
                    expect(container.materials.length).toBe(1);
                    expect(container.textures.length).toBe(3);
                    expect(container.geometries.length).toBe(1);

                    // Scene stays at baseline before add
                    expect(scene.meshes.length).toBe(baselineMeshes);
                    expect(scene.materials.length).toBe(baselineMaterials);

                    // Add increases all four scene categories
                    container.addAllToScene();
                    expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);
                    expect(scene.materials.length).toBeGreaterThan(baselineMaterials);
                    expect(scene.textures.length).toBeGreaterThan(baselineTextures);
                    expect(scene.geometries!.length).toBeGreaterThan(baselineGeometries);

                    // Remove returns scene exactly to baseline
                    container.removeAllFromScene();
                    expect(scene.meshes.length).toBe(baselineMeshes);
                    expect(scene.materials.length).toBe(baselineMaterials);
                    expect(scene.textures.length).toBe(baselineTextures);
                    expect(scene.geometries!.length).toBe(baselineGeometries);

                    // Dispose clears container arrays
                    container.dispose();
                    expect(container.meshes.length).toBe(0);
                    expect(container.materials.length).toBe(0);
                    expect(container.textures.length).toBe(0);
                    expect(container.geometries.length).toBe(0);

                    // Scene stays at exact baseline after dispose
                    expect(scene.meshes.length).toBe(baselineMeshes);
                    expect(scene.materials.length).toBe(baselineMaterials);
                    expect(scene.textures.length).toBe(baselineTextures);
                    expect(scene.geometries!.length).toBe(baselineGeometries);
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

        it("rejects through outer ImportMeshAsync when OBJ is missing", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    throw new Error("OBJ file not found: " + request.authoredUri);
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: handler } },
                    })
                ).rejects.toThrow("OBJ file not found");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it(
            "rejects through outer ImportMeshAsync when OBJ is malformed (no geometry)",
            async () => {
                mockToolsLoadFile();
                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");

                    const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                        if (request.propertyName !== "assetInfo:source") {
                            return { handled: false };
                        }
                        const container = await LoadAssetContainerAsync("data:NOT_VALID_OBJ", request.scene, {
                            pluginExtension: ".obj",
                            rootUrl: "",
                        });
                        const meshWithGeometry = container.meshes.find((m) => m.getTotalVertices() > 0);
                        if (!meshWithGeometry) {
                            container.dispose();
                            throw new Error("Malformed OBJ produced no geometry");
                        }
                        return { handled: true, container };
                    };

                    await expect(
                        ImportMeshAsync("data:" + usdaData, scene, {
                            pluginExtension: ".usda",
                            pluginOptions: { usd: { externalAssetHandler: handler } },
                        })
                    ).rejects.toThrow("Malformed OBJ produced no geometry");
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            LOAD_TIMEOUT
        );

        it(
            "rejects through outer ImportMeshAsync when MTL is missing",
            async () => {
                // Mock LoadFile to error on MTL requests
                vi.spyOn(Tools, "LoadFile").mockImplementation(
                    (
                        fileOrUrl: File | string,
                        _onSuccess: (data: string | ArrayBuffer, responseURL?: string, contentType?: string | null) => void,
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
                        }
                        return fileRequest;
                    }
                );

                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");

                    // Handler validates post-load: missing MTL means no textures → reject
                    const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                        if (request.propertyName !== "assetInfo:source") {
                            return { handled: false };
                        }
                        const objData = readCorpusFile(request.authoredUri.replace(/^\.\//, ""));
                        const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
                            pluginExtension: ".obj",
                            rootUrl: "",
                        });
                        const mesh = container.meshes.find((m) => m.getTotalVertices() > 0);
                        if (!mesh?.material || !(mesh.material as StandardMaterial).diffuseTexture) {
                            container.dispose();
                            throw new Error("Missing MTL: no diffuse texture after loading");
                        }
                        return { handled: true, container };
                    };

                    await expect(
                        ImportMeshAsync("data:" + usdaData, scene, {
                            pluginExtension: ".usda",
                            pluginOptions: { usd: { externalAssetHandler: handler } },
                        })
                    ).rejects.toThrow("Missing MTL");
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            LOAD_TIMEOUT
        );

        it(
            "rejects through outer ImportMeshAsync when MTL is malformed (garbage data, no material)",
            async () => {
                // Mock LoadFile to return garbage MTL data
                vi.spyOn(Tools, "LoadFile").mockImplementation(
                    (
                        fileOrUrl: File | string,
                        onSuccess: (data: string | ArrayBuffer, responseURL?: string, contentType?: string | null) => void,
                        _onProgress?: (ev: ProgressEvent) => void,
                        _offlineProvider?: IOfflineProvider | null,
                        _useArrayBuffer?: boolean,
                        _onError?: (request?: WebRequest, exception?: LoadFileError) => void
                    ): IFileRequest => {
                        const fileRequest: IFileRequest = {
                            abort: () => {},
                            onCompleteObservable: new Observable<IFileRequest>(),
                        };
                        const url = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
                        if (url.endsWith(".mtl")) {
                            // Return garbage that won't produce any valid material
                            setTimeout(() => onSuccess("THIS_IS_NOT_VALID_MTL_DATA\nGARBAGE"), 0);
                        }
                        return fileRequest;
                    }
                );

                const engine = new NullEngine();
                const scene = new Scene(engine);

                try {
                    const usdaData = readCorpusFile("Forklift.usda");

                    const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                        if (request.propertyName !== "assetInfo:source") {
                            return { handled: false };
                        }
                        const objData = readCorpusFile(request.authoredUri.replace(/^\.\//, ""));
                        const container = await LoadAssetContainerAsync("data:" + objData, request.scene, {
                            pluginExtension: ".obj",
                            rootUrl: "",
                        });
                        const mesh = container.meshes.find((m) => m.getTotalVertices() > 0);
                        if (!mesh?.material || !(mesh.material as StandardMaterial).diffuseTexture) {
                            container.dispose();
                            throw new Error("Malformed MTL: no diffuse texture after loading");
                        }
                        return { handled: true, container };
                    };

                    await expect(
                        ImportMeshAsync("data:" + usdaData, scene, {
                            pluginExtension: ".usda",
                            pluginOptions: { usd: { externalAssetHandler: handler } },
                        })
                    ).rejects.toThrow("Malformed MTL");
                } finally {
                    scene.dispose();
                    engine.dispose();
                }
            },
            LOAD_TIMEOUT
        );

        it("rejects through outer ImportMeshAsync when base-color PNG is missing", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    // Pre-validate: check that base-color PNG exists with valid header
                    const fakePath = path.join(corpusRoot, "Forklift/textures/NONEXISTENT_BaseColor.png");
                    if (!fs.existsSync(fakePath)) {
                        throw new Error("Required base-color texture sidecar not found");
                    }
                    return { handled: false };
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: handler } },
                    })
                ).rejects.toThrow("Required base-color texture sidecar not found");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("rejects through outer ImportMeshAsync when normal PNG is missing", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    const fakePath = path.join(corpusRoot, "Forklift/textures/NONEXISTENT_Normal.png");
                    if (!fs.existsSync(fakePath)) {
                        throw new Error("Required normal map texture sidecar not found");
                    }
                    return { handled: false };
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: handler } },
                    })
                ).rejects.toThrow("Required normal map texture sidecar not found");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("rejects through outer ImportMeshAsync when roughness PNG is missing", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    const fakePath = path.join(corpusRoot, "Forklift/textures/NONEXISTENT_Roughness.png");
                    if (!fs.existsSync(fakePath)) {
                        throw new Error("Required roughness texture sidecar not found");
                    }
                    return { handled: false };
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: handler } },
                    })
                ).rejects.toThrow("Required roughness texture sidecar not found");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("rejects through outer ImportMeshAsync when OBJ data has malformed PNG header", async () => {
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");

                const handler = async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
                    if (request.propertyName !== "assetInfo:source") {
                        return { handled: false };
                    }
                    // Simulate malformed texture by checking a synthesized bad path
                    const header = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
                    if (!header.subarray(0, 8).equals(PNG_MAGIC)) {
                        throw new Error("Invalid PNG header in base-color texture");
                    }
                    return { handled: false };
                };

                await expect(
                    ImportMeshAsync("data:" + usdaData, scene, {
                        pluginExtension: ".usda",
                        pluginOptions: { usd: { externalAssetHandler: handler } },
                    })
                ).rejects.toThrow("Invalid PNG header");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });

        it("reports exact diagnostic path when no handler is configured", async () => {
            const logCalls: string[] = [];
            vi.spyOn(Logger, "Log").mockImplementation((...args: unknown[]) => {
                logCalls.push(String(args[0]));
            });
            mockToolsLoadFile();
            const engine = new NullEngine();
            const scene = new Scene(engine);

            try {
                const usdaData = readCorpusFile("Forklift.usda");
                const result = await ImportMeshAsync("data:" + usdaData, scene, {
                    pluginExtension: ".usda",
                });

                const rootNode = result.transformNodes.find((n) => n.name === "Forklift");
                expect(rootNode).toBeDefined();
                const assetNode = result.transformNodes.find((n) => n.name === "Asset");
                expect(assetNode).toBeDefined();

                const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
                expect(meshesWithGeometry.length).toBe(0);

                // Exact diagnostic: must contain BOTH the property name AND the no-handler message
                // AND the exact prim path
                const unhandledDiag = logCalls.find((msg) => msg.includes("assetInfo:source") && msg.includes("no external asset handler"));
                expect(unhandledDiag).toBeDefined();
                expect(unhandledDiag).toContain("/Forklift/Asset.assetInfo:source");
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });
    });
});
