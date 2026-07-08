import { describe, expect, it } from "vitest";

import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { NodeAsset } from "../../src/nodeAsset";

/**
 * Builds a tiny uncompressed glb (one node, one mesh) in code so the roundtrip test does not
 * depend on a bundled binary fixture.
 * @returns The fixture glb bytes.
 */
async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("NodeAsset", () => {
    it("registers blocks with the asset on construction", () => {
        const asset = new NodeAsset("roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        expect(asset.attachedBlocks).toContain(importer);
        expect(asset.attachedBlocks).toContain(exporter);
        expect(asset.attachedBlocks).toHaveLength(2);
    });

    it("imports and exports a glTF, preserving node and mesh counts", async () => {
        const glb = await CreateFixtureGlbAsync();

        const asset = new NodeAsset("roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const result = await asset.buildAsync();

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);

        // Re-parse the exported bytes to prove a genuine read/write roundtrip, not a passthrough.
        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const reparsed = await io.readBinary(result);

        expect(reparsed.getRoot().listNodes()).toHaveLength(1);
        expect(reparsed.getRoot().listMeshes()).toHaveLength(1);
    });

    it("throws when the export block's required input is not connected", async () => {
        const asset = new NodeAsset("missing-input");
        const exporter = new ExportGLTFBlock("export", asset);

        expect(exporter.result).toBeNull();
        await expect(asset.buildAsync()).rejects.toThrow();
    });
});
