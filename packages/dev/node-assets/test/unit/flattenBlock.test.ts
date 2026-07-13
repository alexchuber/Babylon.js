import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { FlattenBlock } from "../../src/Blocks/flattenBlock";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds a document whose mesh sits under an intermediate transformed parent node, so flatten has a
 * hierarchy to collapse.
 * @returns The document and its mesh-bearing child node.
 */
async function CreateNestedHierarchyAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("m").addPrimitive(primitive);

    const child = document.createNode("child").setMesh(mesh);
    const parent = document.createNode("parent").setTranslation([5, 0, 0]).addChild(child);
    document.createScene("scene0").addChild(parent);
    return document;
}

function SceneHasDirectMeshChild(document: Document): boolean {
    const scene = document.getRoot().listScenes()[0];
    return scene.listChildren().some((node) => node.getMesh() !== null);
}

describe("FlattenBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("flatten");
        const block = new FlattenBlock("flatten", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("lifts mesh nodes to the scene root, passing the same document through", async () => {
        const document = await CreateNestedHierarchyAsync();
        expect(SceneHasDirectMeshChild(document)).toBe(false);

        const asset = new NodeAsset("flatten");
        const block = new FlattenBlock("flatten", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        expect(SceneHasDirectMeshChild(document)).toBe(true);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("flatten");
        const block = new FlattenBlock("flatten", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
