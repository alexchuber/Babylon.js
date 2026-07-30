import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { AssetContainer } from "core/assetContainer";
import { Mesh } from "core/Meshes/mesh";
import "core/Meshes/instancedMesh";
import { TransformNode } from "core/Meshes/transformNode";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { RawTexture } from "core/Materials/Textures/rawTexture";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";
import { UsdConfigurationError } from "loaders/USD/usdErrors";

// --- USDA fixtures ---

const singleAssetUsda = `#usda 1.0
(
    defaultPrim = "Root"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Root"
{
    def Xform "Asset"
    {
        custom asset assetInfo:source = @./model.obj@
        double3 xformOp:translate = (1, 2, 3)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`;

const deduplicationUsda = `#usda 1.0
(
    defaultPrim = "Root"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Root"
{
    def Xform "First"
    {
        custom asset assetInfo:source = @./shared.obj@
    }

    def Xform "Second"
    {
        custom asset assetInfo:source = @./shared.obj@
    }

    def Xform "Third"
    {
        custom asset assetInfo:source = @./other.obj@
    }
}
`;

// Parent→child same-URI cycle
const ancestorCycleUsda = `#usda 1.0
(
    defaultPrim = "Root"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Root"
{
    def Xform "Parent"
    {
        custom asset assetInfo:source = @./model.obj@

        def Xform "Child"
        {
            custom asset assetInfo:source = @./model.obj@
        }
    }
}
`;

// Nested different URIs for depth counting
const nestedDifferentUriUsda = `#usda 1.0
(
    defaultPrim = "Root"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Root"
{
    def Xform "Outer"
    {
        custom asset assetInfo:source = @./outer.obj@

        def Xform "Inner"
        {
            custom asset assetInfo:source = @./inner.obj@
        }
    }
}
`;

const noAssetUsda = `#usda 1.0
def Mesh "Quad"
{
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]
    point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    uniform token subdivisionScheme = "none"
}
`;

function generateManyAssetsUsda(count: number): string {
    const prims = Array.from(
        { length: count },
        (_, index) => `    def Xform "Asset${index}"
    {
        custom asset assetInfo:source = @./model${index}.obj@
    }`
    );
    return `#usda 1.0
(
    defaultPrim = "Root"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Root"
{
${prims.join("\n\n")}
}
`;
}

// --- Source container factories ---

function createFlatSourceContainer(scene: Scene, meshName: string = "loaded-mesh"): AssetContainer {
    const container = new AssetContainer(scene);
    const mesh = new Mesh(meshName, scene);
    const vertexData = new VertexData();
    vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    vertexData.indices = [0, 1, 2];
    vertexData.applyToMesh(mesh);
    const material = new StandardMaterial(meshName + "-mat", scene);
    mesh.material = material;
    container.meshes.push(mesh);
    container.materials.push(material);
    container.removeAllFromScene();
    return container;
}

// Nested: root TransformNode → child Mesh (tests hierarchy preservation)
function createNestedSourceContainer(scene: Scene): AssetContainer {
    const container = new AssetContainer(scene);
    const root = new TransformNode("model-root", scene);
    const child = new Mesh("model-child", scene);
    const vertexData = new VertexData();
    vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    vertexData.indices = [0, 1, 2];
    vertexData.applyToMesh(child);
    const material = new StandardMaterial("model-mat", scene);
    child.material = material;
    child.parent = root;
    container.transformNodes.push(root);
    container.meshes.push(child);
    container.materials.push(material);
    container.removeAllFromScene();
    return container;
}

// Textured: Mesh with geometry + StandardMaterial with a RawTexture (tests texture ownership transfer)
function createTexturedSourceContainer(scene: Scene): AssetContainer {
    const container = new AssetContainer(scene);
    const mesh = new Mesh("textured-mesh", scene);
    const vertexData = new VertexData();
    vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    vertexData.indices = [0, 1, 2];
    vertexData.applyToMesh(mesh);
    const material = new StandardMaterial("textured-mat", scene);
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 0, 0, 255]), 1, 1, scene, false, false);
    texture.name = "synthetic-diffuse";
    material.diffuseTexture = texture;
    mesh.material = material;
    container.meshes.push(mesh);
    container.materials.push(material);
    container.textures.push(texture);
    container.removeAllFromScene();
    return container;
}

describe("USD external asset handler", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        warnSpy = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("invokes the handler with correct request shape", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            await loader.importMeshAsync(null, scene, singleAssetUsda, "http://example.com/assets/");

            expect(handler).toHaveBeenCalledTimes(1);
            const request = handler.mock.calls[0][0];
            expect(request.primPath).toBe("/Root/Asset");
            expect(request.propertyName).toBe("assetInfo:source");
            expect(request.authoredUri).toBe("./model.obj");
            expect(request.resolvedUri).toBe("http://example.com/assets/model.obj");
            expect(request.scene).toBe(scene);
            expect(request.ancestry).toContain("/Root/Asset");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("deduplicates: handler called once per URI, two distinct cloned instances with hierarchy", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createNestedSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const result = await loader.importMeshAsync(null, scene, deduplicationUsda, "");

            expect(handler).toHaveBeenCalledTimes(2);

            const firstNode = result.transformNodes.find((n) => n.name === "First");
            const secondNode = result.transformNodes.find((n) => n.name === "Second");

            // Each prim should have a cloned root TransformNode child
            const firstRoots = result.transformNodes.filter((n) => n.parent === firstNode);
            const secondRoots = result.transformNodes.filter((n) => n.parent === secondNode);
            expect(firstRoots.length).toBeGreaterThan(0);
            expect(secondRoots.length).toBeGreaterThan(0);
            expect(firstRoots[0]).not.toBe(secondRoots[0]);

            // Intermediate transform nodes tracked in result.transformNodes
            expect(result.transformNodes).toContain(firstRoots[0]);
            expect(result.transformNodes).toContain(secondRoots[0]);

            // Child meshes tracked and preserve hierarchy
            const firstMeshes = result.meshes.filter((m) => firstRoots.some((r) => m.parent === r));
            const secondMeshes = result.meshes.filter((m) => secondRoots.some((r) => m.parent === r));
            expect(firstMeshes.length).toBeGreaterThan(0);
            expect(secondMeshes.length).toBeGreaterThan(0);

            // Materials cloned independently
            expect(firstMeshes[0].material).toBeDefined();
            expect(secondMeshes[0].material).toBeDefined();
            expect(firstMeshes[0].material).not.toBe(secondMeshes[0].material);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("deterministically disposes handler containers and cloned geometry/materials remain valid", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const containers: AssetContainer[] = [];
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            const container = createFlatSourceContainer(r.scene);
            containers.push(container);
            return { handled: true, container };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const result = await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            // Source container was deterministically disposed
            for (const container of containers) {
                expect(container.meshes.length).toBe(0);
            }

            // Cloned geometry remains valid: position buffer contents and vertex count
            expect(result.meshes.length).toBeGreaterThan(0);
            const clonedMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
            expect(clonedMesh).toBeDefined();
            expect(clonedMesh!.getTotalVertices()).toBe(3);
            const positions = clonedMesh!.getVerticesData("position");
            expect(positions).toBeDefined();
            expect(positions!.length).toBe(9);
            expect(positions![0]).toBe(0);
            expect(positions![3]).toBe(1);
            expect(positions![7]).toBe(1);

            // Cloned material remains valid and usable
            expect(clonedMesh!.material).toBeDefined();
            expect(clonedMesh!.material).toBeInstanceOf(StandardMaterial);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("outer LoadAssetContainerAsync dispose returns scene to baseline", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createNestedSourceContainer(r.scene) };
        });

        try {
            const baselineMeshes = scene.meshes.length;
            const baselineTransforms = scene.transformNodes.length;
            const baselineMaterials = scene.materials.length;
            const baselineGeometries = scene.geometries.length;

            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const container = await loader.loadAssetContainerAsync(scene, singleAssetUsda, "");

            expect(container.meshes.length).toBeGreaterThan(0);
            expect(scene.meshes.length).toBe(baselineMeshes);

            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);

            container.removeAllFromScene();
            container.dispose();

            expect(scene.meshes.length).toBe(baselineMeshes);
            expect(scene.transformNodes.length).toBe(baselineTransforms);
            expect(scene.materials.length).toBe(baselineMaterials);
            expect(scene.geometries.length).toBe(baselineGeometries);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("source textures are disposed (onDisposeObservable fires) while cloned textures are distinct and valid", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const sourceDisposeCount: number[] = [];
        const sourceTextures: import("core/Materials/Textures/baseTexture").BaseTexture[] = [];
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            const container = createTexturedSourceContainer(r.scene);
            // Capture source texture references and subscribe to onDisposeObservable
            for (const tex of container.textures) {
                sourceTextures.push(tex);
                const idx = sourceDisposeCount.length;
                sourceDisposeCount.push(0);
                tex.onDisposeObservable.add(() => {
                    sourceDisposeCount[idx]++;
                });
            }
            return { handled: true, container };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const result = await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            // Source texture onDisposeObservable fired exactly once per texture
            expect(sourceTextures.length).toBe(1);
            expect(sourceDisposeCount.length).toBe(1);
            expect(sourceDisposeCount[0]).toBe(1);

            // Cloned geometry survives template disposal
            const clonedMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
            expect(clonedMesh).toBeDefined();
            expect(clonedMesh!.getTotalVertices()).toBe(3);

            // Cloned material's diffuse texture is a DISTINCT object from the disposed source
            expect(clonedMesh!.material).toBeInstanceOf(StandardMaterial);
            const mat = clonedMesh!.material as StandardMaterial;
            expect(mat.diffuseTexture).not.toBeNull();
            expect(mat.diffuseTexture).not.toBe(sourceTextures[0]);
            // Clone texture is valid (getSize returns non-zero for a 1×1 RawTexture clone)
            expect(mat.diffuseTexture!.getSize().width).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("outer AssetContainer dispose releases cloned textured content and returns scene to baseline", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createTexturedSourceContainer(r.scene) };
        });

        try {
            const baselineMeshes = scene.meshes.length;
            const baselineMaterials = scene.materials.length;
            const baselineGeometries = scene.geometries.length;
            const baselineTextures = scene.textures.length;

            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const container = await loader.loadAssetContainerAsync(scene, singleAssetUsda, "");

            // Container owns textured content
            expect(container.meshes.length).toBeGreaterThan(0);
            expect(container.textures.length).toBeGreaterThan(0);

            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(baselineMeshes);
            expect(scene.textures.length).toBeGreaterThan(baselineTextures);

            // Track clone texture disposal via observable
            const cloneDisposeCount: number[] = [];
            for (const tex of container.textures) {
                const idx = cloneDisposeCount.length;
                cloneDisposeCount.push(0);
                tex.onDisposeObservable.add(() => {
                    cloneDisposeCount[idx]++;
                });
            }

            container.removeAllFromScene();
            container.dispose();

            // Clone textures were disposed by outer container
            for (const count of cloneDisposeCount) {
                expect(count).toBe(1);
            }

            // Scene returns to baseline
            expect(scene.meshes.length).toBe(baselineMeshes);
            expect(scene.materials.length).toBe(baselineMaterials);
            expect(scene.geometries.length).toBe(baselineGeometries);
            expect(scene.textures.length).toBe(baselineTextures);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects ancestor URI cycle with diagnostic", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            await loader.importMeshAsync(null, scene, ancestorCycleUsda, "");

            expect(handler).toHaveBeenCalledTimes(1);
            const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
            const cycleDiag = warnCalls.find((msg) => msg.includes("cycle") && msg.includes("/Root/Parent/Child"));
            expect(cycleDiag).toBeDefined();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("counts nested different-URI depth and rejects at maxExternalAssetDepth", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler, maxExternalAssetDepth: 1 });
            await loader.importMeshAsync(null, scene, nestedDifferentUriUsda, "");

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0].authoredUri).toBe("./outer.obj");
            const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
            expect(warnCalls.some((msg) => msg.includes("depth limit") && msg.includes("/Root/Outer/Inner"))).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("emits Logger diagnostic when no handler is configured", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader();
            await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
            const diag = logCalls.find((msg) => msg.includes("assetInfo:source") && msg.includes("no external asset handler"));
            expect(diag).toBeDefined();
            expect(diag).toContain("/Root/Asset.assetInfo:source");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("emits per-occurrence diagnostic for cached unsupported results", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (): Promise<UsdExternalAssetResult> => ({ handled: false }));

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            await loader.importMeshAsync(null, scene, deduplicationUsda, "");

            const logCalls = logSpy.mock.calls.map((c) => c[0] as string);
            const unsupportedDiags = logCalls.filter((msg) => msg.includes("unsupported"));
            expect(unsupportedDiags.length).toBe(3);
            expect(unsupportedDiags.some((msg) => msg.includes("/Root/First"))).toBe(true);
            expect(unsupportedDiags.some((msg) => msg.includes("/Root/Second"))).toBe(true);
            expect(unsupportedDiags.some((msg) => msg.includes("/Root/Third"))).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("enforces request count limits with warning diagnostic", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler, maxExternalAssetRequests: 2 });
            await loader.importMeshAsync(null, scene, generateManyAssetsUsda(5), "");

            expect(handler).toHaveBeenCalledTimes(2);
            const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
            expect(warnCalls.filter((msg) => msg.includes("request limit")).length).toBe(3);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("propagates handler exceptions as SceneLoader failures", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: async () => { throw new Error("Handler network error"); } });
            await expect(loader.importMeshAsync(null, scene, singleAssetUsda, "")).rejects.toThrow("Handler network error");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("does not invoke handler for standard schema properties", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            await loader.importMeshAsync(null, scene, noAssetUsda, "");
            expect(handler).toHaveBeenCalledTimes(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects invalid maxExternalAssetRequests with UsdConfigurationError", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: async () => ({ handled: false }), maxExternalAssetRequests: -1 });
            await expect(loader.importMeshAsync(null, scene, singleAssetUsda, "")).rejects.toThrow(UsdConfigurationError);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects invalid maxExternalAssetDepth with UsdConfigurationError", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = new USDFileLoader({ externalAssetHandler: async () => ({ handled: false }), maxExternalAssetDepth: 1.5 });
            await expect(loader.importMeshAsync(null, scene, singleAssetUsda, "")).rejects.toThrow(UsdConfigurationError);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

describe("USD external asset handler via module-level SceneLoader", () => {
    beforeEach(() => {
        RegisterUSDFileLoader();
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("passes handler via pluginOptions and invokes it", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const result = await ImportMeshAsync("data:" + singleAssetUsda, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: handler } },
            });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0].primPath).toBe("/Root/Asset");
            expect(result.meshes.length).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("propagates handler exceptions through module-level ImportMeshAsync", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            await expect(
                ImportMeshAsync("data:" + singleAssetUsda, scene, {
                    pluginExtension: ".usda",
                    pluginOptions: { usd: { externalAssetHandler: async () => { throw new Error("Module handler error"); } } },
                })
            ).rejects.toThrow("Module handler error");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("module-level LoadAssetContainerAsync owns handler content", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createFlatSourceContainer(r.scene) };
        });

        try {
            const container = await LoadAssetContainerAsync("data:" + singleAssetUsda, scene, {
                pluginExtension: ".usda",
                pluginOptions: { usd: { externalAssetHandler: handler } },
            });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(container.meshes.length).toBeGreaterThan(0);

            container.addAllToScene();
            expect(scene.meshes.length).toBeGreaterThan(0);

            container.removeAllFromScene();
            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
