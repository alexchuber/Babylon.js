import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { GLTF2BabylonBlock } from "../../src/Blocks/gltf2BabylonBlock";
import { Babylon2GLTFBlock } from "../../src/Blocks/babylon2GLTFBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { BabylonAsset, IsBabylonAsset } from "../../src/representations/babylonAsset";
import { GltfAsset, IsGltfAsset } from "../../src/representations/gltfAsset";
import { CreateTestBabylonAsset } from "./testBabylonAsset";
import { GetTestGltfDocument } from "./testGltfAsset";

// Re-export the real draco3dgltf to avoid the global vitest stub.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateTestGltfDocument(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);
    return document;
}

function CreateTestGltfAsset(document: Document, identity = "test-gltf"): GltfAsset {
    return new GltfAsset(document, {
        identity,
        revision: 0,
        manifest: { format: "gltf" },
    });
}

describe("GLTF2BabylonBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new GLTF2BabylonBlock("transcode", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
    });

    it("transcodes a glTF document to a BabylonAsset", async () => {
        const document = await CreateTestGltfDocument();
        const gltfAsset = CreateTestGltfAsset(document);

        const asset = new NodeAsset("test");
        const block = new GLTF2BabylonBlock("transcode", asset);

        block.input.value = gltfAsset;

        await block._buildBlockAsync();

        const result = block.output.value;
        expect(IsBabylonAsset(result)).toBe(true);

        const babylonAsset = result as BabylonAsset;
        expect(babylonAsset.scene).toBeDefined();
        expect(babylonAsset.engine).toBeDefined();
        expect(babylonAsset.identity).toBe("test-gltf");

        babylonAsset.dispose();
    });

    it("throws when no input is connected", async () => {
        const asset = new NodeAsset("test");
        const block = new GLTF2BabylonBlock("transcode", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow("no input document");
    });
});

describe("Babylon2GLTFBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new Babylon2GLTFBlock("transcode", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("transcodes a BabylonAsset to a GltfAsset", async () => {
        const babylonAsset = CreateTestBabylonAsset("exportMesh", "test-babylon");

        const asset = new NodeAsset("test");
        const block = new Babylon2GLTFBlock("transcode", asset);

        block.input.value = babylonAsset;

        await block._buildBlockAsync();

        const result = block.output.value;
        expect(IsGltfAsset(result)).toBe(true);

        const gltfAsset = result as GltfAsset;
        expect(gltfAsset.document).toBeDefined();
        expect(gltfAsset.identity).toBe("test-babylon");

        babylonAsset.dispose();
    });

    it("throws when no input is connected", async () => {
        const asset = new NodeAsset("test");
        const block = new Babylon2GLTFBlock("transcode", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow("no input scene");
    });
});

describe("GLTF → Babylon round-trip", () => {
    it("preserves mesh existence through transcode", async () => {
        const document = await CreateTestGltfDocument();
        const gltfAsset = CreateTestGltfAsset(document);

        const nodeAsset = new NodeAsset("roundtrip");
        const toBabylon = new GLTF2BabylonBlock("toBabylon", nodeAsset);
        const toGltf = new Babylon2GLTFBlock("toGltf", nodeAsset);

        toBabylon.input.value = gltfAsset;
        await toBabylon._buildBlockAsync();

        toGltf.input.value = toBabylon.output.value;
        await toGltf._buildBlockAsync();

        const result = toGltf.output.value as GltfAsset;
        const reparsedDoc = result.document;
        expect(reparsedDoc.getRoot().listMeshes().length).toBeGreaterThan(0);
        expect(reparsedDoc.getRoot().listNodes().length).toBeGreaterThan(0);

        (toBabylon.output.value as BabylonAsset).dispose();
    });
});
