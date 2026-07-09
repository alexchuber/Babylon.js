import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NormalsBlock } from "../../src/Blocks/normalsBlock";

/**
 * Builds a triangle with POSITION data but no NORMAL attribute, so the normals operation has work to
 * do.
 * @returns The document.
 */
async function CreateTriangleWithoutNormalsAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("tri").addPrimitive(primitive);
    document.createScene("scene0").addChild(document.createNode("triNode").setMesh(mesh));
    return document;
}

function GetFirstPrimitiveHasNormals(document: Document): boolean {
    return document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("NORMAL") !== null;
}

describe("NormalsBlock", () => {
    it("registers a SCENE input and output on construction", () => {
        const asset = new NodeAsset("normals");
        const block = new NormalsBlock("normals", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.SCENE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.SCENE);
    });

    it("generates missing vertex normals, passing the same document through", async () => {
        const document = await CreateTriangleWithoutNormalsAsync();
        expect(GetFirstPrimitiveHasNormals(document)).toBe(false);

        const asset = new NodeAsset("normals");
        const block = new NormalsBlock("normals", asset);
        block.input.value = document;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(document);
        expect(GetFirstPrimitiveHasNormals(document)).toBe(true);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("normals");
        const block = new NormalsBlock("normals", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
