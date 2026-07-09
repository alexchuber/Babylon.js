import { type Document, type Primitive } from "@gltf-transform/core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { BuildPBRMaterial } from "../../src/Blocks/buildPBRMaterial";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportImageBlock } from "../../src/Blocks/importImageBlock";
import { NodeAsset } from "../../src/nodeAsset";

// The import/export blocks register the Draco encoder/decoder, so use the real module rather than the
// stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// The bundled compose-up showcase assets served to the editor, read straight off disk so the headless
// seam exercises the exact bytes the editor ships.
const ShowcaseAssetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tools/playground/public/scenes/nodeAssets");
const BareCubeGlb = new Uint8Array(readFileSync(path.join(ShowcaseAssetsDir, "bareCube.glb")));
const BaseColorPng = new Uint8Array(readFileSync(path.join(ShowcaseAssetsDir, "baseColor.png")));

/**
 * Re-parses exported glb bytes into a `Document` for assertions.
 * @param glb - The glb bytes.
 * @returns The parsed document.
 */
async function ReparseAsync(glb: Uint8Array): Promise<Document> {
    const { WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.readBinary(glb);
}

/**
 * Collects every mesh primitive reachable from a document's default (or first) scene.
 * @param document - The document to walk.
 * @returns The primitives found in the scene.
 */
function CollectScenePrimitives(document: Document): Primitive[] {
    const root = document.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const primitives: Primitive[] = [];
    if (!scene) {
        return primitives;
    }
    scene.traverse((node) => {
        const mesh = node.getMesh();
        if (mesh) {
            primitives.push(...mesh.listPrimitives());
        }
    });
    return primitives;
}

describe("compose-up showcase graph", () => {
    it("bundles a bare, untextured .glb (no materials) as the showcase source", async () => {
        const asset = new NodeAsset("bare-source");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = BareCubeGlb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());

        // The bundled source must be bare so BuildPBRMaterial's assignment has something to light up.
        expect(reparsed.getRoot().listMaterials()).toHaveLength(0);
        expect(reparsed.getRoot().listMeshes().length).toBeGreaterThan(0);
    });

    it("turns a bare .glb + an image into a textured glTF (import -> build -> export -> reparse)", async () => {
        const asset = new NodeAsset("compose-up");
        const importGltf = new ImportGLTFBlock("import-gltf", asset);
        importGltf.data = BareCubeGlb;
        const importImage = new ImportImageBlock("import-image", asset);
        importImage.data = BaseColorPng;
        importImage.mimeType = "image/png";
        const build = new BuildPBRMaterial("build", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        // ImportGLTF -> BuildPBRMaterial.scene, ImportImage -> BuildPBRMaterial.baseColor, build -> export.
        importGltf.output.connectTo(build.scene);
        importImage.output.connectTo(build.baseColor);
        build.output.connectTo(exporter.input);

        const reparsed = await ReparseAsync(await asset.buildAsync());
        const root = reparsed.getRoot();

        // Exactly one PBR material with a base-colour texture came out the funnel.
        expect(root.listMaterials()).toHaveLength(1);
        expect(root.listTextures()).toHaveLength(1);
        const material = root.listMaterials()[0];
        expect(material.getBaseColorTexture()).not.toBeNull();
        expect(material.getBaseColorTexture()!.getMimeType()).toBe("image/png");

        // The heart of the showcase: the once-bare mesh's primitives now reference the built material.
        const primitives = CollectScenePrimitives(reparsed);
        expect(primitives.length).toBeGreaterThan(0);
        for (const primitive of primitives) {
            expect(primitive.getMaterial()).toBe(material);
        }
    });
});
