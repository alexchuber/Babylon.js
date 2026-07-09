import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { JoinBlock } from "../../src/Blocks/joinBlock";

/**
 * Builds a document with two separate mesh nodes that share a single material, so join can merge them
 * into one mesh.
 * @returns The document.
 */
async function CreateTwoJoinableMeshesAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const material = document.createMaterial("shared").setBaseColorFactor([1, 0, 0, 1]);
    const scene = document.createScene("scene0");

    for (let i = 0; i < 2; i++) {
        const position = document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([i, 0, 0, i + 1, 0, 0, i, 1, 0]))
            .setBuffer(buffer);
        const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
        const mesh = document.createMesh(`m${i}`).addPrimitive(primitive);
        scene.addChild(document.createNode(`n${i}`).setMesh(mesh));
    }

    return document;
}

describe("JoinBlock", () => {
    it("registers a SCENE input and output on construction", () => {
        const asset = new NodeAsset("join");
        const block = new JoinBlock("join", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("merges compatible meshes, passing the same document through", async () => {
        const document = await CreateTwoJoinableMeshesAsync();
        expect(document.getRoot().listMeshes()).toHaveLength(2);

        const asset = new NodeAsset("join");
        const block = new JoinBlock("join", asset);
        block.input.value = document;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(document);
        expect(document.getRoot().listMeshes()).toHaveLength(1);
    });

    it("keeps meshes separate when keepMeshes is set", async () => {
        const document = await CreateTwoJoinableMeshesAsync();

        const asset = new NodeAsset("join");
        const block = new JoinBlock("join", asset);
        block.keepMeshes = true;
        block.input.value = document;

        await block._buildBlockAsync();

        expect(document.getRoot().listMeshes()).toHaveLength(2);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("join");
        const block = new JoinBlock("join", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
