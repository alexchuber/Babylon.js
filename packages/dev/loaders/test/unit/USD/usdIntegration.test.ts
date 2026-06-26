import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial.pure";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { ResolveUsdStageWithFetcherAsync } from "loaders/USD/resolution/usdResolver";
import { AdaptResolvedStageToScene } from "loaders/USD/adapter/usdAdapter";

// Root layer references a prim from a separate child layer. Composing this offline (with no real file
// IO) is something the browser-side three.js loader cannot do; the injectable fetcher makes it testable.
const rootUsda = `#usda 1.0
(
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def "Ref" (
        prepend references = @./child.usda@</Shape>
    )
    {
    }
}
`;

const childUsda = `#usda 1.0

def Mesh "Shape"
{
    int[] faceVertexCounts = [4]
    int[] faceVertexIndices = [0, 1, 2, 3]
    point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
}
`;

// Single layer binding a mesh to a UsdPreviewSurface material, used to exercise the walk's material
// binding end to end through the public loader.
const materialUsda = `#usda 1.0
(
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def Mesh "Quad"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
        rel material:binding = </World/Mat>
    }

    def Material "Mat"
    {
        def Shader "Preview"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0.1, 0.2, 0.3)
            float inputs:metallic = 0.25
            float inputs:roughness = 0.6
        }
    }
}
`;

describe("USD loader integration", () => {
    it("composes a referenced child layer into the scene via an injected fetcher", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const stage = await ResolveUsdStageWithFetcherAsync(rootUsda, "", "root.usda", {}, async (identifier) => {
            if (identifier.includes("child.usda")) {
                return childUsda;
            }
            throw new Error(`Unexpected external layer request: ${identifier}`);
        });

        const result = AdaptResolvedStageToScene(stage, scene, null, {});

        // The "Ref" prim has no geometry of its own; its mesh comes entirely from the referenced child layer.
        const referenced = result.meshes.find((mesh) => mesh.name === "Ref");
        expect(referenced).toBeDefined();
        expect(referenced!.getTotalVertices()).toBe(4);
        expect(referenced!.getIndices()!.length).toBe(6);

        scene.dispose();
        engine.dispose();
    });

    it("binds a UsdPreviewSurface material to the mesh end to end", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new USDFileLoader();

        const result = await loader.importMeshAsync(null, scene, materialUsda, "");

        const quad = result.meshes.find((mesh) => mesh.name === "Quad");
        expect(quad).toBeDefined();
        expect(quad!.material).toBeInstanceOf(PBRMaterial);

        const material = quad!.material as PBRMaterial;
        expect(material.albedoColor.r).toBeCloseTo(0.1);
        expect(material.albedoColor.g).toBeCloseTo(0.2);
        expect(material.albedoColor.b).toBeCloseTo(0.3);
        expect(material.metallic).toBeCloseTo(0.25);
        expect(material.roughness).toBeCloseTo(0.6);

        scene.dispose();
        engine.dispose();
    });
});
