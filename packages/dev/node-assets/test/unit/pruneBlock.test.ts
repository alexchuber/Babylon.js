import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { PruneBlock } from "../../src/Blocks/pruneBlock";

/**
 * Builds a document that carries dead weight: an unused material referenced by nothing, and an empty
 * leaf node with no mesh or children — both of which prune removes by default.
 * @returns The document.
 */
async function CreateDocumentWithUnusedDataAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("used").addPrimitive(primitive);

    // Unused material, referenced by no primitive.
    document.createMaterial("orphan").setBaseColorFactor([0, 1, 0, 1]);

    const scene = document.createScene("scene0");
    scene.addChild(document.createNode("used").setMesh(mesh));
    // Empty leaf node: no mesh, no children.
    scene.addChild(document.createNode("emptyLeaf"));
    return document;
}

describe("PruneBlock", () => {
    it("registers a SCENE input and output on construction", () => {
        const asset = new NodeAsset("prune");
        const block = new PruneBlock("prune", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("removes unused materials and empty leaf nodes, passing the same document through", async () => {
        const document = await CreateDocumentWithUnusedDataAsync();
        expect(document.getRoot().listMaterials()).toHaveLength(1);
        expect(document.getRoot().listNodes()).toHaveLength(2);

        const asset = new NodeAsset("prune");
        const block = new PruneBlock("prune", asset);
        block.input.value = document;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(document);
        expect(document.getRoot().listMaterials()).toHaveLength(0);
        expect(document.getRoot().listNodes()).toHaveLength(1);
    });

    it("keeps empty leaf nodes when keepLeaves is set", async () => {
        const document = await CreateDocumentWithUnusedDataAsync();

        const asset = new NodeAsset("prune");
        const block = new PruneBlock("prune", asset);
        block.keepLeaves = true;
        block.input.value = document;

        await block._buildBlockAsync();

        expect(document.getRoot().listNodes()).toHaveLength(2);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("prune");
        const block = new PruneBlock("prune", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
