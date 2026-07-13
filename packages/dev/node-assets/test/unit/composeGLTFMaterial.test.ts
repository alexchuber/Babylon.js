import { describe, expect, it } from "vitest";

import { ComposeGLTFMaterialBlock } from "../../src/Blocks/composeGLTFMaterialBlock";
import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../../src/connection/nodeAssetValueMap";
import { NodeAsset } from "../../src/nodeAsset";

/** A 1x1 red PNG for texture fixture. */
const TinyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
    0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("ComposeGLTFMaterialBlock", () => {
    it("registers five inputs and one JSON output", () => {
        const asset = new NodeAsset("shape");
        const block = new ComposeGLTFMaterialBlock("compose", asset);

        expect(asset.attachedBlocks).toContain(block);
        expect(block.inputs).toHaveLength(5);
        expect(block.outputs).toHaveLength(1);
        expect(block.metallic.type).toBe(NodeAssetConnectionPointType.NUMBER);
        expect(block.roughness.type).toBe(NodeAssetConnectionPointType.NUMBER);
        expect(block.baseColor.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(block.normal.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(block.emissive.type).toBe(NodeAssetConnectionPointType.IMAGE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("composes a full material descriptor with all inputs connected", async () => {
        const asset = new NodeAsset("full");
        const block = new ComposeGLTFMaterialBlock("compose", asset);
        block.metallic.value = 0.5;
        block.roughness.value = 0.8;
        block.baseColor.value = { data: TinyPng, mimeType: "image/png" } satisfies ImagePayload;
        block.normal.value = { data: TinyPng, mimeType: "image/png" } satisfies ImagePayload;
        block.emissive.value = { data: TinyPng, mimeType: "image/png" } satisfies ImagePayload;

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).metallicFactor).toBe(0.5);
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).roughnessFactor).toBe(0.8);
        expect(result.hasBaseColorTexture).toBe(true);
        expect(result.hasNormalTexture).toBe(true);
        expect(result.hasEmissiveTexture).toBe(true);
    });

    it("composes a material descriptor with only numeric inputs", async () => {
        const asset = new NodeAsset("numbers-only");
        const block = new ComposeGLTFMaterialBlock("compose", asset);
        block.metallic.value = 0.3;
        block.roughness.value = 0.7;

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).metallicFactor).toBe(0.3);
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).roughnessFactor).toBe(0.7);
        expect(result.hasBaseColorTexture).toBe(false);
        expect(result.hasNormalTexture).toBe(false);
        expect(result.hasEmissiveTexture).toBe(false);
    });

    it("uses default factor values when numeric inputs are null", async () => {
        const asset = new NodeAsset("defaults");
        const block = new ComposeGLTFMaterialBlock("compose", asset);

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        // glTF defaults: metallic=1.0, roughness=1.0
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).metallicFactor).toBe(1.0);
        expect((result.pbrMetallicRoughness as NodeAssetJsonObject).roughnessFactor).toBe(1.0);
    });

    it("includes texture data references when images are provided", async () => {
        const asset = new NodeAsset("with-textures");
        const block = new ComposeGLTFMaterialBlock("compose", asset);
        block.baseColor.value = { data: TinyPng, mimeType: "image/png" } satisfies ImagePayload;

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.hasBaseColorTexture).toBe(true);
        expect(result.hasNormalTexture).toBe(false);
        expect(result.hasEmissiveTexture).toBe(false);
    });

    it("outputs a valid JSON-serializable object", async () => {
        const asset = new NodeAsset("serializable");
        const block = new ComposeGLTFMaterialBlock("compose", asset);
        block.metallic.value = 0.5;
        block.roughness.value = 0.8;

        await block._buildBlockAsync();

        const result = block.output.value;
        // Must round-trip through JSON.stringify/parse without loss
        const roundTripped = JSON.parse(JSON.stringify(result));
        expect(roundTripped).toEqual(result);
    });

    it("clamps metallic factor to [0, 1]", async () => {
        const asset = new NodeAsset("clamp-metallic");
        const block = new ComposeGLTFMaterialBlock("compose", asset);
        block.metallic.value = 1.5;
        block.roughness.value = -0.5;

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        const pbr = result.pbrMetallicRoughness as NodeAssetJsonObject;
        expect(pbr.metallicFactor).toBe(1.0);
        expect(pbr.roughnessFactor).toBe(0.0);
    });
});
