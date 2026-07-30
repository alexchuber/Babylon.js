import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { AssetContainer } from "core/assetContainer";
import { Mesh } from "core/Meshes/mesh";
import "core/Meshes/instancedMesh";
import { TransformNode } from "core/Meshes/transformNode";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { USDFileLoader, RegisterUSDFileLoader } from "loaders/USD/usdFileLoader.pure";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";
import { UsdConfigurationError } from "loaders/USD/usdErrors";

// --- Test USDA fixtures ---

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
        double3 xformOp:translate = (-2, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }

    def Xform "Second"
    {
        custom asset assetInfo:source = @./shared.obj@
        double3 xformOp:translate = (2, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }

    def Xform "Third"
    {
        custom asset assetInfo:source = @./other.obj@
    }
}
`;

// Parent prim has an external asset URI; child prim has the SAME URI → ancestry cycle.
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

// Parent and child have DIFFERENT URIs → counts toward depth, not a cycle.
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

// --- Source container factory ---

function createSourceContainer(scene: Scene, meshName: string = "loaded-mesh"): AssetContainer {
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

// Nested hierarchy: root transform → child mesh. Tests that instantiation preserves hierarchy.
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
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createSourceContainer(request.scene) };
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
            expect(request.ancestry).toContain("/Root");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("deduplicates: handler called once per URI, two distinct instances under correct parents", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createNestedSourceContainer(request.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const result = await loader.importMeshAsync(null, scene, deduplicationUsda, "");

            // shared.obj: handler called once; other.obj: handler called once
            expect(handler).toHaveBeenCalledTimes(2);

            const firstNode = result.transformNodes.find((n) => n.name === "First");
            const secondNode = result.transformNodes.find((n) => n.name === "Second");
            expect(firstNode).toBeDefined();
            expect(secondNode).toBeDefined();

            // Each should have an instantiated child hierarchy
            const firstRoots = result.transformNodes.filter((n) => n.parent === firstNode);
            const secondRoots = result.transformNodes.filter((n) => n.parent === secondNode);
            expect(firstRoots.length).toBeGreaterThan(0);
            expect(secondRoots.length).toBeGreaterThan(0);

            // Distinct instances — not the same object
            expect(firstRoots[0]).not.toBe(secondRoots[0]);

            // Both should have child meshes in the result
            const firstMeshes = result.meshes.filter((m) => firstRoots.some((r) => m.parent === r));
            const secondMeshes = result.meshes.filter((m) => secondRoots.some((r) => m.parent === r));
            expect(firstMeshes.length).toBeGreaterThan(0);
            expect(secondMeshes.length).toBeGreaterThan(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects ancestor URI cycle with diagnostic", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createSourceContainer(request.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            await loader.importMeshAsync(null, scene, ancestorCycleUsda, "");

            // Handler called once for the parent's model.obj; child's same URI is rejected as a cycle
            expect(handler).toHaveBeenCalledTimes(1);

            const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
            const cycleDiag = warnCalls.find((msg) => msg.includes("cycle") && msg.includes("model.obj"));
            expect(cycleDiag).toBeDefined();
            expect(cycleDiag).toContain("/Root/Parent/Child");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("counts nested different-URI depth and rejects at maxExternalAssetDepth", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createSourceContainer(request.scene) };
        });

        try {
            // maxDepth=1: outer.obj at depth 0 succeeds, inner.obj at depth 1 is rejected
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

            // 3 occurrences (First/shared, Second/shared cached, Third/other) → 3 diagnostics
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
            return { handled: true, container: createSourceContainer(r.scene) };
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
        const handler = vi.fn(async (): Promise<UsdExternalAssetResult> => {
            throw new Error("Handler network error");
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
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
            return { handled: true, container: createSourceContainer(r.scene) };
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

    it("outer loadAssetContainerAsync owns instantiated content and disposes cleanly", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createNestedSourceContainer(r.scene) };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler });
            const container = await loader.loadAssetContainerAsync(scene, singleAssetUsda, "");

            // Meshes should be in the container
            expect(container.meshes.length).toBeGreaterThan(0);
            // Scene should be clean before addAllToScene
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

    it("passes handler via pluginOptions and invokes it for asset properties", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createSourceContainer(r.scene) };
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

    it("module-level LoadAssetContainerAsync owns handler content and parents correctly", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (r: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: true, container: createSourceContainer(r.scene) };
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
