import { type Document, type vec3 } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { CenterBlock } from "../../src/Blocks/centerBlock";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds a triangle offset far from the origin so centering has a visible effect on the scene bounds.
 * @returns The document.
 */
async function CreateOffsetTriangleAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([10, 0, 0, 11, 0, 0, 10, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("tri").addPrimitive(primitive);
    document.createScene("scene0").addChild(document.createNode("triNode").setMesh(mesh));
    return document;
}

async function GetSceneBoundsCenterAsync(document: Document): Promise<vec3> {
    const { getBounds } = await import("@gltf-transform/core");
    const bounds = getBounds(document.getRoot().listScenes()[0]);
    return [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
}

describe("CenterBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("center");
        const block = new CenterBlock("center", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("recenters the scene at the origin, passing the same document through", async () => {
        const document = await CreateOffsetTriangleAsync();
        const before = await GetSceneBoundsCenterAsync(document);
        expect(Math.abs(before[0])).toBeGreaterThan(5);

        const asset = new NodeAsset("center");
        const block = new CenterBlock("center", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        const after = await GetSceneBoundsCenterAsync(document);
        expect(Math.abs(after[0])).toBeLessThan(0.5);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("center");
        const block = new CenterBlock("center", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
