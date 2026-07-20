import { describe, expect, it } from "vitest";

import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { ConfigureNodeAssetBuildResources, type INodeAssetBuildResourceUrls } from "../../src/nodeAssets/nodeAssetBuildResources";

const ResourceUrls: INodeAssetBuildResourceUrls = {
    basisEncoderJsUrl: "/local/basis.js",
    basisEncoderWasmUrl: "/local/basis.wasm",
    dracoDecoderWasmUrl: "/local/draco-decoder.wasm",
    dracoEncoderWasmUrl: "/local/draco-encoder.wasm",
    usdWasmUrl: "/local/usd.wasm",
};

describe("node asset build resources", () => {
    it("uses local KTX2 encoder locations as fallbacks without replacing authored locations", () => {
        const asset = new NodeAsset("encoder-locations");
        const defaults = new KTX2CompressionBlock("defaults", asset);
        const authored = new KTX2CompressionBlock("authored", asset);
        authored.jsUrl = "https://example.com/custom-basis.js";
        authored.wasmUrl = "https://example.com/custom-basis.wasm";

        ConfigureNodeAssetBuildResources(asset, ResourceUrls);

        expect(defaults.jsUrl).toBe(ResourceUrls.basisEncoderJsUrl);
        expect(defaults.wasmUrl).toBe(ResourceUrls.basisEncoderWasmUrl);
        expect(authored.jsUrl).toBe("https://example.com/custom-basis.js");
        expect(authored.wasmUrl).toBe("https://example.com/custom-basis.wasm");
    });
});
