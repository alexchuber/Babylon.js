import { describe, expect, it } from "vitest";
import * as fflate from "fflate";
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

// Root layer whose reference points at a sub-directory asset path. When the stage is loaded from a
// flat drag-and-drop set (rootUrl "file:"), Babylon stores every dropped file in FilesInputStore by
// basename, so the loader must address the sibling as `file:child.usda`, not `file:assets/child.usda`.
const fileSchemeRootUsda = `#usda 1.0
(
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def "Ref" (
        prepend references = @./assets/child.usda@</Shape>
    )
    {
    }
}
`;

// Single layer whose UsdPreviewSurface diffuse is driven by a UsdUVTexture pointing at a sub-directory
// asset path, used to prove texture references resolve to `file:<basename>` under the dropped-file scheme.
const fileSchemeTextureUsda = `#usda 1.0
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
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1), (0, 1)] (interpolation = "vertex")
        rel material:binding = </World/Mat>
    }

    def Material "Mat"
    {
        token outputs:surface.connect = </World/Mat/Preview.outputs:surface>

        def Shader "Preview"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor.connect = </World/Mat/Albedo.outputs:rgb>
            float inputs:metallic = 0
            float inputs:roughness = 0.5
            token outputs:surface
        }

        def Shader "Albedo"
        {
            uniform token info:id = "UsdUVTexture"
            asset inputs:file = @textures/Albedo.png@
            float2 inputs:st.connect = </World/Mat/Reader.outputs:result>
            float3 outputs:rgb
        }

        def Shader "Reader"
        {
            uniform token info:id = "UsdPrimvarReader_float2"
            token inputs:varname = "st"
            float2 outputs:result
        }
    }
}
`;

// A DistantLight and a Camera in one stage, exercising the UsdLux/UsdGeomCamera schema mappings all
// the way through to real Babylon Light and Camera objects via the public loader.
const lightCameraUsda = `#usda 1.0
(
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "World"
{
    def DistantLight "Sun"
    {
        color3f inputs:color = (1, 0.9, 0.8)
        float inputs:intensity = 2
    }

    def Camera "Cam"
    {
        token projection = "perspective"
        float focalLength = 50
        float2 clippingRange = (0.1, 1000)
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

    it("reads a USDZ archive and composes its embedded inner layer offline", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // Pack the root and child layers into a STORE-compressed USDZ; the inner root references the
        // sibling child by name, so composing it relies on archive-embedded resolution, not the network.
        const archive = fflate.zipSync(
            {
                "root.usda": new TextEncoder().encode(rootUsda),
                "child.usda": new TextEncoder().encode(childUsda),
            },
            { level: 0 }
        );

        const stage = await ResolveUsdStageWithFetcherAsync(archive.buffer, "", "model.usdz", { fflate }, (identifier) => {
            throw new Error(`USDZ composition must not hit the network, but requested: ${identifier}`);
        });

        const result = AdaptResolvedStageToScene(stage, scene, null, {});

        // "Ref" resolves only if the embedded child.usda was composed straight from the archive.
        const referenced = result.meshes.find((mesh) => mesh.name === "Ref");
        expect(referenced).toBeDefined();
        expect(referenced!.getTotalVertices()).toBe(4);

        scene.dispose();
        engine.dispose();
    });

    it("maps a UsdLux light and a UsdGeomCamera to Babylon objects end to end", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new USDFileLoader();

        const result = await loader.importMeshAsync(null, scene, lightCameraUsda, "");

        expect(result.lights.length).toBe(1);
        expect(result.lights[0].name).toBe("Sun");
        expect(scene.getCameraByName("Cam")).not.toBeNull();

        scene.dispose();
        engine.dispose();
    });

    it("resolves sibling layer references by basename under the dropped-file scheme", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // A flat multi-file drop keys siblings by basename in FilesInputStore, so the authored
        // sub-directory ("./assets/child.usda") must collapse to a "file:child.usda" request.
        const requested: string[] = [];
        const stage = await ResolveUsdStageWithFetcherAsync(fileSchemeRootUsda, "file:", "ChessSet.usda", {}, async (identifier) => {
            requested.push(identifier);
            if (identifier === "file:child.usda") {
                return childUsda;
            }
            throw new Error(`Unexpected external layer request: ${identifier}`);
        });

        const result = AdaptResolvedStageToScene(stage, scene, null, {});

        // "Ref" resolves only if the sibling layer was fetched and composed from the dropped set.
        const referenced = result.meshes.find((mesh) => mesh.name === "Ref");
        expect(referenced).toBeDefined();
        expect(referenced!.getTotalVertices()).toBe(4);
        expect(requested).toContain("file:child.usda");

        scene.dispose();
        engine.dispose();
    });

    it("resolves texture references by basename under the dropped-file scheme", async () => {
        // No external layers here; the only sibling is the texture, which must resolve against the
        // dropped set as "file:albedo.png" (scheme preserved, sub-directory dropped, lower-cased).
        const stage = await ResolveUsdStageWithFetcherAsync(fileSchemeTextureUsda, "file:", "Quad.usda", {}, async (identifier) => {
            throw new Error(`No external layers expected, but requested: ${identifier}`);
        });

        expect(stage.materials.length).toBe(1);
        expect(stage.materials[0].textures.baseColor?.uri).toBe("file:albedo.png");
    });
});
