import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { SimplifyBlock } from "../../src/Blocks/simplifyBlock";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds an indexed, welded grid mesh dense enough for the simplifier to collapse. Vertices are shared
 * between cells so the mesh is a single connected surface with a slight height variation.
 * @param cells - The number of cells per side.
 * @returns The document.
 */
async function CreateIndexedGridAsync(cells: number): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const side = cells + 1;
    const positions: number[] = [];
    for (let z = 0; z < side; z++) {
        for (let x = 0; x < side; x++) {
            positions.push(x, 0.1 * Math.sin(x) * Math.cos(z), z);
        }
    }

    const indices: number[] = [];
    for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
            const topLeft = z * side + x;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + side;
            const bottomRight = bottomLeft + 1;
            indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
        }
    }

    const position = document.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
    const index = document.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(index);
    const mesh = document.createMesh("grid").addPrimitive(primitive);
    document.createScene("scene0").addChild(document.createNode("gridNode").setMesh(mesh));
    return document;
}

function GetIndexCount(document: Document): number {
    return document.getRoot().listMeshes()[0].listPrimitives()[0].getIndices()!.getCount();
}

describe("SimplifyBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("simplify");
        const block = new SimplifyBlock("simplify", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("reduces triangle count, passing the same document through", async () => {
        const document = await CreateIndexedGridAsync(12);
        const before = GetIndexCount(document);

        const asset = new NodeAsset("simplify");
        const block = new SimplifyBlock("simplify", asset);
        block.ratio = 0.25;
        block.error = 1;
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        expect(GetIndexCount(document)).toBeLessThan(before);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("simplify");
        const block = new SimplifyBlock("simplify", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
