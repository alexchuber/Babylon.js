import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { DecomposeGLTFMaterialBlock } from "../../src/Blocks/decomposeGLTFMaterialBlock";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateTestGltfAsset } from "./testGltfAsset";

/** A 1x1 red PNG for texture fixture. */
const TinyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
    0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Builds a Document with a fully-textured PBR material.
 * @returns The test document.
 */
function CreateTexturedMaterialDocument(): Document {
    const document = new Document();
    const baseColorTex = document.createTexture("baseColorTex").setImage(TinyPng).setMimeType("image/png");
    const normalTex = document.createTexture("normalTex").setImage(TinyPng).setMimeType("image/png");
    const emissiveTex = document.createTexture("emissiveTex").setImage(TinyPng).setMimeType("image/png");

    document
        .createMaterial("TexturedMat")
        .setMetallicFactor(0.5)
        .setRoughnessFactor(0.8)
        .setBaseColorTexture(baseColorTex)
        .setNormalTexture(normalTex)
        .setEmissiveTexture(emissiveTex)
        .setEmissiveFactor([0.1, 0.2, 0.3]);

    return document;
}

/**
 * Builds a Document with a simple material (no textures).
 * @returns The test document.
 */
function CreateBareMaterialDocument(): Document {
    const document = new Document();
    document.createMaterial("BareMat").setMetallicFactor(0.2).setRoughnessFactor(0.9);
    return document;
}

/**
 * Builds a Document with two materials.
 * @returns The test document.
 */
function CreateMultiMaterialDocument(): Document {
    const document = new Document();
    document.createMaterial("MatA").setMetallicFactor(0.1).setRoughnessFactor(0.2);
    document.createMaterial("MatB").setMetallicFactor(0.9).setRoughnessFactor(0.3);
    return document;
}

describe("DecomposeGLTFMaterialBlock", () => {
    it("registers GLTF_DOCUMENT + JSON inputs and five outputs", () => {
        const asset = new NodeAsset("shape");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(2);
        expect(block.outputs).toHaveLength(5);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.selector.type).toBe(NodeAssetConnectionPointType.JSON);
        expect(block.metallic.type).toBe(NodeAssetConnectionPointType.NUMBER);
        expect(block.roughness.type).toBe(NodeAssetConnectionPointType.NUMBER);
        expect(block.baseColor.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(block.normal.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(block.emissive.type).toBe(NodeAssetConnectionPointType.IMAGE);
    });

    it("decomposes a fully-textured material selected by index", async () => {
        const document = CreateTexturedMaterialDocument();
        const asset = new NodeAsset("by-index");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { index: 0 };

        await block._buildBlockAsync();

        expect(block.metallic.value).toBe(0.5);
        expect(block.roughness.value).toBe(0.8);

        const baseColor = block.baseColor.value as ImagePayload;
        expect(baseColor).toBeDefined();
        expect(baseColor.data).toBeInstanceOf(Uint8Array);
        expect(baseColor.mimeType).toBe("image/png");

        const normal = block.normal.value as ImagePayload;
        expect(normal).toBeDefined();
        expect(normal.data).toBeInstanceOf(Uint8Array);

        const emissiveImg = block.emissive.value as ImagePayload;
        expect(emissiveImg).toBeDefined();
        expect(emissiveImg.data).toBeInstanceOf(Uint8Array);
    });

    it("decomposes a material selected by name", async () => {
        const document = CreateMultiMaterialDocument();
        const asset = new NodeAsset("by-name");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { name: "MatB" };

        await block._buildBlockAsync();

        expect(block.metallic.value).toBe(0.9);
        expect(block.roughness.value).toBe(0.3);
    });

    it("outputs null for texture channels when the material has no textures", async () => {
        const document = CreateBareMaterialDocument();
        const asset = new NodeAsset("no-textures");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { index: 0 };

        await block._buildBlockAsync();

        expect(block.metallic.value).toBe(0.2);
        expect(block.roughness.value).toBe(0.9);
        expect(block.baseColor.value).toBeNull();
        expect(block.normal.value).toBeNull();
        expect(block.emissive.value).toBeNull();
    });

    it("selects the second material from a multi-material document by index", async () => {
        const document = CreateMultiMaterialDocument();
        const asset = new NodeAsset("multi-index");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { index: 1 };

        await block._buildBlockAsync();

        expect(block.metallic.value).toBe(0.9);
        expect(block.roughness.value).toBe(0.3);
    });

    it("throws when the material index is out of range", async () => {
        const document = CreateBareMaterialDocument();
        const asset = new NodeAsset("out-of-range");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { index: 99 };

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the material name is not found", async () => {
        const document = CreateBareMaterialDocument();
        const asset = new NodeAsset("bad-name");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);
        block.selector.value = { name: "NonExistent" };

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the input document is missing", async () => {
        const asset = new NodeAsset("missing-input");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.selector.value = { index: 0 };

        expect(block.input.value).toBeNull();
        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("throws when the selector is null", async () => {
        const document = CreateBareMaterialDocument();
        const asset = new NodeAsset("null-selector");
        const block = new DecomposeGLTFMaterialBlock("decompose", asset);
        block.input.value = CreateTestGltfAsset(document);

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("includes the block name in error diagnostics", async () => {
        const asset = new NodeAsset("named-error");
        const block = new DecomposeGLTFMaterialBlock("myDecompose", asset);
        block.selector.value = { index: 0 };

        await expect(block._buildBlockAsync()).rejects.toThrow("myDecompose");
    });
});
