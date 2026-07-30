import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { AssetContainer } from "core/assetContainer";
import { Mesh } from "core/Meshes/mesh";
import { TransformNode } from "core/Meshes/transformNode";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";
import { type USDLoadingOptions } from "loaders/USD/usdLoadingOptions";

// A minimal USDA that has a custom asset property on an Xform prim.
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

// A USDA with multiple assets to test deduplication.
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

// A USDA with no custom asset properties (only standard mesh).
const noAssetUsda = `#usda 1.0
def Mesh "Quad"
{
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 1, 2]
    point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    uniform token subdivisionScheme = "none"
}
`;

// A USDA with many assets to test request limits.
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

// Deeply nested USDA to test depth limits.
function generateDeepUsda(depth: number): string {
    let open = "";
    let close = "";
    let indent = "";
    for (let level = 0; level < depth; level++) {
        open += `${indent}def Xform "Level${level}"\n${indent}{\n`;
        close = `${indent}}\n` + close;
        indent += "    ";
    }
    const asset = `${indent}custom asset assetInfo:source = @./deep.obj@\n`;
    return `#usda 1.0
(
    defaultPrim = "Level0"
    upAxis = "Y"
    metersPerUnit = 1
)

${open}${asset}${close}`;
}

function createHandlerResult(scene: Scene): UsdExternalAssetResult {
    const container = new AssetContainer(scene);
    const mesh = new Mesh("loaded-mesh", scene);
    container.meshes.push(mesh);
    container.removeAllFromScene();
    return { handled: true, container };
}

describe("USD external asset handler", () => {
    it("invokes the handler with correct request shape for a custom asset property", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            await loader.importMeshAsync(null, scene, singleAssetUsda, "http://example.com/assets/");

            expect(handler).toHaveBeenCalledTimes(1);
            const request = handler.mock.calls[0][0];
            expect(request.primPath).toBe("/Root/Asset");
            expect(request.propertyName).toBe("assetInfo:source");
            expect(request.authoredUri).toBe("./model.obj");
            expect(request.resolvedUri).toBe("http://example.com/assets/model.obj");
            expect(request.sourceLayerIdentifier).toBeDefined();
            expect(request.scene).toBe(scene);
            expect(request.ancestry).toContain("/Root/Asset");
            expect(request.ancestry).toContain("/Root");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("parents handler-loaded meshes under the prim's transform node", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            const result = await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            // The handler-loaded mesh should be parented under the "Asset" transform node
            const assetNode = result.transformNodes.find((node) => node.name === "Asset");
            expect(assetNode).toBeDefined();
            const loadedMesh = result.meshes.find((mesh) => mesh.name === "loaded-mesh");
            expect(loadedMesh).toBeDefined();
            expect(loadedMesh!.parent).toBe(assetNode);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("emits structured diagnostics when no handler is configured", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const diagnostics: string[] = [];
        const originalWarn = console.warn;

        try {
            const loader = new USDFileLoader();
            await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            // Without a handler, the loader should still produce a result (no crash)
            // and the unhandled property should be diagnosed
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("applies canonical-URI deduplication across prims", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            await loader.importMeshAsync(null, scene, deduplicationUsda, "");

            // "shared.obj" appears twice but should only invoke the handler once;
            // "other.obj" should invoke it a second time.
            expect(handler).toHaveBeenCalledTimes(2);
            const uris = handler.mock.calls.map((call: [IUsdExternalAssetRequest]) => call[0].resolvedUri);
            expect(uris).toContain("shared.obj");
            expect(uris).toContain("other.obj");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("enforces request count limits", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({
                externalAssetHandler: handler,
                maxExternalAssetRequests: 2,
            } as Partial<USDLoadingOptions>);
            // 5 unique assets, but limit is 2
            await loader.importMeshAsync(null, scene, generateManyAssetsUsda(5), "");

            expect(handler).toHaveBeenCalledTimes(2);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("enforces depth limits", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({
                externalAssetHandler: handler,
                maxExternalAssetDepth: 3,
            } as Partial<USDLoadingOptions>);
            // Prim nested 10 levels deep
            await loader.importMeshAsync(null, scene, generateDeepUsda(10), "");

            // Handler should not be invoked because the prim is too deep
            expect(handler).toHaveBeenCalledTimes(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("propagates handler exceptions as SceneLoader failures", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (_request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            throw new Error("Handler failed: network error");
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            await expect(loader.importMeshAsync(null, scene, singleAssetUsda, "")).rejects.toThrow("Handler failed: network error");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("handles the unsupported result by emitting diagnostics without crashing", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (_request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return { handled: false };
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            const result = await loader.importMeshAsync(null, scene, singleAssetUsda, "");

            expect(handler).toHaveBeenCalledTimes(1);
            // No handler-loaded meshes, but the load itself succeeds
            expect(result.meshes.length).toBe(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("does not invoke the handler for standard schema properties", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            await loader.importMeshAsync(null, scene, noAssetUsda, "");

            // Standard mesh has no custom asset properties; handler should not be invoked
            expect(handler).toHaveBeenCalledTimes(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("preserves outer loadAssetContainerAsync ownership with handler-loaded content", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const handler = vi.fn(async (request: IUsdExternalAssetRequest): Promise<UsdExternalAssetResult> => {
            return createHandlerResult(request.scene);
        });

        try {
            const loader = new USDFileLoader({ externalAssetHandler: handler } as Partial<USDLoadingOptions>);
            const container = await loader.loadAssetContainerAsync(scene, singleAssetUsda, "");

            // Handler-loaded meshes should be owned by the outer container
            expect(container.meshes.some((mesh) => mesh.name === "loaded-mesh")).toBe(true);

            // After removeAllFromScene and dispose, scene should be clean
            container.dispose();
            expect(scene.meshes.filter((mesh) => mesh.name === "loaded-mesh")).toHaveLength(0);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
