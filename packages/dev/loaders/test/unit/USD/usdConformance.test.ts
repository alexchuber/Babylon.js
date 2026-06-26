import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { ResolveUsdStageWithFetcherAsync } from "loaders/USD/resolution/usdResolver";
import { AdaptResolvedStageToScene } from "loaders/USD/adapter/usdAdapter";

// These conformance tests drive flagship "exceed three.js" capabilities all the way from USDA text
// through parse -> compose (LIVERPS) -> map -> adapt, asserting on the resulting Babylon scene graph.
// They are fully offline and deterministic (NullEngine, no network, no binary fixtures).

async function LoadUsdaAsync(source: string): Promise<{ scene: Scene; dispose: () => void; result: Awaited<ReturnType<USDFileLoader["importMeshAsync"]>> }> {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const loader = new USDFileLoader();
    const result = await loader.importMeshAsync(null, scene, source, "");
    return {
        scene,
        result,
        dispose: () => {
            scene.dispose();
            engine.dispose();
        },
    };
}

describe("USD conformance", () => {
    it("instances a PointInstancer prototype as thin instances", async () => {
        const usda = `#usda 1.0
(
    upAxis = "Y"
)

def PointInstancer "Instancer"
{
    point3f[] positions = [(0, 0, 0), (3, 0, 0)]
    int[] protoIndices = [0, 0]
    rel prototypes = [</Instancer/Prototypes/Proto>]

    def Scope "Prototypes"
    {
        def Mesh "Proto"
        {
            int[] faceVertexCounts = [4]
            int[] faceVertexIndices = [0, 1, 2, 3]
            point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
        }
    }
}
`;

        const { result, dispose } = await LoadUsdaAsync(usda);

        const prototype = result.meshes.find((mesh) => mesh.name === "Instancer_proto0");
        expect(prototype).toBeDefined();
        expect(prototype!.thinInstanceCount).toBe(2);

        dispose();
    });

    it("selects the authored variant and bakes only that variant's opinion", async () => {
        const variantUsda = (selection: string) => `#usda 1.0

def Xform "World" (
    variants = {
        string layout = "${selection}"
    }
    prepend variantSets = "layout"
)
{
    variantSet "layout" = {
        "shifted" {
            double3 xformOp:translate = (10, 0, 0)
            uniform token[] xformOpOrder = ["xformOp:translate"]
        }
        "origin" {
        }
    }

    def Mesh "Quad"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
    }
}
`;

        const rejectFetch = (identifier: string) => Promise.reject(new Error(`Unexpected external layer request: ${identifier}`));

        // Selecting "shifted" must bake (10, 0, 0) and produce no missing-variant diagnostic (the
        // `variantSets` placeholder and the authored `variantSet` body must resolve to one set).
        const shiftedStage = await ResolveUsdStageWithFetcherAsync(variantUsda("shifted"), "", "variant.usda", {}, rejectFetch);
        expect(shiftedStage.diagnostics.filter((diagnostic) => diagnostic.message.includes("does not exist in variant set"))).toEqual([]);

        const shiftedEngine = new NullEngine();
        const shiftedScene = new Scene(shiftedEngine);
        const shiftedResult = AdaptResolvedStageToScene(shiftedStage, shiftedScene, null, {});
        expect(shiftedResult.transformNodes.find((node) => node.name === "World")!.position.x).toBeCloseTo(10);
        shiftedScene.dispose();
        shiftedEngine.dispose();

        // Selecting "origin" authors no transform; World must stay at the origin. This discriminates real
        // variant selection from a parser that would hoist the variant body onto the prim regardless.
        const originStage = await ResolveUsdStageWithFetcherAsync(variantUsda("origin"), "", "variant.usda", {}, rejectFetch);
        const originEngine = new NullEngine();
        const originScene = new Scene(originEngine);
        const originResult = AdaptResolvedStageToScene(originStage, originScene, null, {});
        expect(originResult.transformNodes.find((node) => node.name === "World")!.position.x).toBeCloseTo(0);
        originScene.dispose();
        originEngine.dispose();
    });

    it("applies a class opinion through an inherits arc", async () => {
        const usda = `#usda 1.0

class Xform "_Base"
{
    double3 xformOp:translate = (4, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}

def Xform "A" (
    inherits = </_Base>
)
{
    def Mesh "Quad"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
    }
}
`;

        const { result, dispose } = await LoadUsdaAsync(usda);

        const a = result.transformNodes.find((node) => node.name === "A");
        expect(a).toBeDefined();
        expect(a!.position.x).toBeCloseTo(4);

        dispose();
    });

    it("composes a sublayer and honors root-over-sublayer strength (LIVERPS)", async () => {
        // The root layer sublayers the base and overrides the same transform opinion. LIVERPS makes the
        // root layer stronger than its sublayers, so the root's translate must win.
        const rootLayer = `#usda 1.0
(
    subLayers = [
        @./base.usda@
    ]
)

over "World"
{
    double3 xformOp:translate = (9, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
`;

        const baseLayer = `#usda 1.0

def Xform "World"
{
    double3 xformOp:translate = (1, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]

    def Mesh "Quad"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
    }
}
`;

        const engine = new NullEngine();
        const scene = new Scene(engine);

        const stage = await ResolveUsdStageWithFetcherAsync(rootLayer, "", "root.usda", {}, (identifier) => {
            if (identifier.includes("base.usda")) {
                return Promise.resolve(baseLayer);
            }
            return Promise.reject(new Error(`Unexpected external layer request: ${identifier}`));
        });

        const result = AdaptResolvedStageToScene(stage, scene, null, {});

        const world = result.transformNodes.find((node) => node.name === "World");
        expect(world).toBeDefined();
        expect(world!.position.x).toBeCloseTo(9);

        scene.dispose();
        engine.dispose();
    });
});
