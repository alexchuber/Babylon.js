import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { GLTFSelectorBlock } from "../../src/Blocks/gltfSelectorBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds a Document with one material and one node for pointer resolution tests.
 * @returns The test document.
 */
function CreateFixtureDocument(): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const material = document.createMaterial("TestMat").setMetallicFactor(0.3).setRoughnessFactor(0.7).setEmissiveFactor([0.1, 0.2, 0.3]);
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
    const mesh = document.createMesh("TestMesh").addPrimitive(primitive);
    const node = document.createNode("TestNode").setTranslation([1, 2, 3]).setMesh(mesh);
    document.createScene("TestScene").addChild(node);
    return document;
}

describe("GLTFSelectorBlock", () => {
    it("registers GLTF_DOCUMENT + STRING inputs and a JSON output", () => {
        const asset = new NodeAsset("shape");
        const block = new GLTFSelectorBlock("sel", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(2);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.query.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("selects a material by pointer and outputs its JSON representation", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("select-mat");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "/materials/0";

        await block._buildBlockAsync();

        const result = block.output.value as Record<string, unknown>;
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(typeof result).toBe("object");
        // The material should contain standard PBR properties
        expect(result.name).toBe("TestMat");
    });

    it("selects a node by pointer and outputs its JSON representation", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("select-node");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "/nodes/0";

        await block._buildBlockAsync();

        const result = block.output.value as Record<string, unknown>;
        expect(result).toBeDefined();
        expect(result.name).toBe("TestNode");
        expect(result.translation).toEqual([1, 2, 3]);
    });

    it("selects a mesh by pointer", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("select-mesh");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "/meshes/0";

        await block._buildBlockAsync();

        const result = block.output.value as Record<string, unknown>;
        expect(result).toBeDefined();
        expect(result.name).toBe("TestMesh");
    });

    it("throws on an invalid pointer that does not start with /", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("bad-pointer");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "materials/0";

        await expect(block._buildBlockAsync()).rejects.toThrow(/must start with/);
    });

    it("throws when the pointer references an out-of-range index", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("out-of-range");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "/materials/99";

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the pointer references an unknown collection", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("unknown-coll");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "/unknowns/0";

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing-input");
        const block = new GLTFSelectorBlock("sel", asset);
        block.query.value = "/materials/0";

        expect(block.input.value).toBeNull();
        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the query string is empty", async () => {
        const document = CreateFixtureDocument();
        const asset = new NodeAsset("empty-query");
        const block = new GLTFSelectorBlock("sel", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.query.value = "";

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("includes the block name in error diagnostics", async () => {
        const asset = new NodeAsset("named-error");
        const block = new GLTFSelectorBlock("mySelector", asset);
        block.query.value = "/materials/0";

        await expect(block._buildBlockAsync()).rejects.toThrow("mySelector");
    });
});
