import { describe, expect, it, vi } from "vitest";

import { EvaluateNodeGeometryBlock } from "../../src/Blocks/evaluateNodeGeometryBlock";
import { ImportNodeGeometryBlock } from "../../src/Blocks/importNodeGeometryBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { IsBabylonAsset, type BabylonAsset } from "../../src/representations/babylonAsset";
import { NodeGeometryAsset } from "../../src/representations/nodeGeometryAsset";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { GeometryOutputBlock } from "core/Meshes/Node/Blocks/geometryOutputBlock";
import { BoxBlock } from "core/Meshes/Node/Blocks/Sources/boxBlock";

// Re-export the real draco3dgltf to avoid the global vitest stub.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

function CreateMinimalNodeGeometry(): NodeGeometry {
    const ng = new NodeGeometry("testNG");
    const boxBlock = new BoxBlock("box");
    const outputBlock = new GeometryOutputBlock("output");
    boxBlock.geometry.connectTo(outputBlock.geometry);
    ng.outputBlock = outputBlock;
    ng.attachedBlocks.push(boxBlock, outputBlock);
    return ng;
}

function CreateTestNodeGeometryAsset(): NodeGeometryAsset {
    const ng = CreateMinimalNodeGeometry();
    return new NodeGeometryAsset(ng, {
        identity: "test-ng",
        revision: 0,
        manifest: { format: "nodeGeometry" },
    });
}

describe("ImportNodeGeometryBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new ImportNodeGeometryBlock("import", asset);

        expect(block.url.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.NODE_GEOMETRY);
    });

    it("throws when no URL or snippet ID is provided", async () => {
        const asset = new NodeAsset("test");
        const block = new ImportNodeGeometryBlock("import", asset);
        block.url.value = "";

        await expect(block._buildBlockAsync()).rejects.toThrow("no URL or snippet ID");
    });
});

describe("EvaluateNodeGeometryBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.NODE_GEOMETRY);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
    });

    it("evaluates a NodeGeometryAsset and produces a BabylonAsset", async () => {
        const ngAsset = CreateTestNodeGeometryAsset();

        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        block.input.value = ngAsset;

        await block._buildBlockAsync();

        const result = block.output.value;
        expect(IsBabylonAsset(result)).toBe(true);

        const babylonAsset = result as BabylonAsset;
        expect(babylonAsset.scene).toBeDefined();
        expect(babylonAsset.engine).toBeDefined();
        expect(babylonAsset.identity).toBe("test-ng");

        // The scene should contain the mesh produced by the geometry evaluation.
        expect(babylonAsset.scene.meshes.length).toBeGreaterThan(0);

        babylonAsset.dispose();
        ngAsset.dispose();
    });

    it("does not mutate the input NodeGeometryAsset", async () => {
        const ngAsset = CreateTestNodeGeometryAsset();
        const originalBlockCount = ngAsset.nodeGeometry.attachedBlocks.length;

        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);
        block.input.value = ngAsset;

        await block._buildBlockAsync();

        // The original asset should still have the same number of blocks.
        expect(ngAsset.nodeGeometry.attachedBlocks.length).toBe(originalBlockCount);

        (block.output.value as BabylonAsset).dispose();
        ngAsset.dispose();
    });

    it("throws when no input is connected", async () => {
        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow("no input Node Geometry");
    });
});
