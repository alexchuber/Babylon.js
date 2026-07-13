import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { WeldBlock } from "../../src/Blocks/weldBlock";
import { CreateTestGltfAsset } from "./testGltfAsset";

/**
 * Builds a two-triangle quad whose six vertices include two bit-identical duplicate pairs, so welding
 * must collapse it to four unique vertices. The primitive is left un-indexed so weld both indexes and
 * de-duplicates it.
 * @returns The document and its (unwelded) vertex count.
 */
async function CreateUnweldedQuadAsync(): Promise<{ document: Document; vertexCount: number }> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    // Two triangles sharing an edge: vertices 1 and 2 are each repeated exactly.
    const positions = new Float32Array([
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0, // triangle A
        1,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        0, // triangle B (repeats (1,0,0) and (0,1,0))
    ]);
    const position = document.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("quad").addPrimitive(primitive);
    document.createScene("scene0").addChild(document.createNode("quadNode").setMesh(mesh));
    return { document, vertexCount: positions.length / 3 };
}

function GetPositionCount(document: Document): number {
    return document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")?.getCount() ?? 0;
}

describe("WeldBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("weld");
        const block = new WeldBlock("weld", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("merges bit-identical vertices and passes the same document through", async () => {
        const { document, vertexCount } = await CreateUnweldedQuadAsync();
        expect(GetPositionCount(document)).toBe(vertexCount);
        expect(vertexCount).toBe(6);

        const asset = new NodeAsset("weld");
        const block = new WeldBlock("weld", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        expect(GetPositionCount(document)).toBe(4);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("weld");
        const block = new WeldBlock("weld", asset);

        expect(block.input.value).toBeNull();
        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
