import { type Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { NodeAsset } from "../../src/nodeAsset";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { QuantizeBlock } from "../../src/Blocks/quantizeBlock";
import { CreateTestGltfAsset } from "./testGltfAsset";

const KHR_MESH_QUANTIZATION = "KHR_mesh_quantization";
// glTF accessor component type for 32-bit float, i.e. un-quantized vertex data.
const GL_FLOAT = 5126;

/**
 * Builds an indexed triangle with float POSITION data, so quantize has full-precision attributes to
 * reduce.
 * @returns The document.
 */
async function CreateFloatTriangleAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();

    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const index = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array([0, 1, 2]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(index);
    const mesh = document.createMesh("tri").addPrimitive(primitive);
    document.createScene("scene0").addChild(document.createNode("triNode").setMesh(mesh));
    return document;
}

function GetPositionComponentType(document: Document): number {
    return document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")!.getComponentType();
}

describe("QuantizeBlock", () => {
    it("registers a GLTF_DOCUMENT input and output on construction", () => {
        const asset = new NodeAsset("quantize");
        const block = new QuantizeBlock("quantize", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("quantizes attributes and declares KHR_mesh_quantization, passing the same document through", async () => {
        const document = await CreateFloatTriangleAsync();
        expect(document.getRoot().listExtensionsUsed()).toHaveLength(0);
        expect(GetPositionComponentType(document)).toBe(GL_FLOAT);

        const asset = new NodeAsset("quantize");
        const block = new QuantizeBlock("quantize", asset);
        const gltf = CreateTestGltfAsset(document);
        block.input.value = gltf;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(gltf);
        expect(
            document
                .getRoot()
                .listExtensionsUsed()
                .map((extension) => extension.extensionName)
        ).toContain(KHR_MESH_QUANTIZATION);
        // POSITION is now stored as reduced-precision integers rather than 32-bit floats.
        expect(GetPositionComponentType(document)).not.toBe(GL_FLOAT);
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("quantize");
        const block = new QuantizeBlock("quantize", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });
});
