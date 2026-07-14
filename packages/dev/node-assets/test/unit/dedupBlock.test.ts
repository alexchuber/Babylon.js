import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { DedupBlock } from "../../src/Blocks/dedupBlock";
import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds a document with two structurally identical materials on two primitives, plus a duplicate
 * mesh, so dedup has redundant materials and meshes to collapse.
 * @returns The document.
 */
async function CreateDuplicateHeavyDocumentAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const makePosition = () =>
        document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);

    // Two materials with identical properties (and identical names) — dedup should merge them into one.
    const materialA = document.createMaterial("red").setBaseColorFactor([1, 0, 0, 1]);
    const materialB = document.createMaterial("red").setBaseColorFactor([1, 0, 0, 1]);

    const primitiveA = document.createPrimitive().setAttribute("POSITION", makePosition()).setMaterial(materialA);
    const primitiveB = document.createPrimitive().setAttribute("POSITION", makePosition()).setMaterial(materialB);

    const meshA = document.createMesh("m").addPrimitive(primitiveA);
    const meshB = document.createMesh("m").addPrimitive(primitiveB);

    const scene = document.createScene("scene0");
    scene.addChild(document.createNode("a").setMesh(meshA));
    scene.addChild(document.createNode("b").setMesh(meshB));
    return document;
}

describe("DedupBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("dedup");
        const block = new DedupBlock("dedup", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("collapses duplicate materials and meshes, passing the same document through", async () => {
        const document = await CreateDuplicateHeavyDocumentAsync();
        expect(document.getRoot().listMaterials()).toHaveLength(2);
        expect(document.getRoot().listMeshes()).toHaveLength(2);

        const asset = new NodeAsset("dedup");
        const block = new DedupBlock("dedup", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        expect(document.getRoot().listMaterials()).toHaveLength(1);
        expect(document.getRoot().listMeshes()).toHaveLength(1);
    });

    it("keeps duplicates with unique names when keepUniqueNames is set", async () => {
        const document = await CreateDuplicateHeavyDocumentAsync();
        document.getRoot().listMaterials()[0].setName("first");
        document.getRoot().listMaterials()[1].setName("second");

        const asset = new NodeAsset("dedup");
        const block = new DedupBlock("dedup", asset);
        block.keepUniqueNames = true;
        block.input.value = CreateTestGltfAsset(document);

        await block._buildBlockAsync();

        expect(document.getRoot().listMaterials()).toHaveLength(2);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("dedup");
        const block = new DedupBlock("dedup", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
