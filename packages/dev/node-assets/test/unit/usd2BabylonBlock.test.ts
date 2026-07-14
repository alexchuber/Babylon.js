import { describe, expect, it } from "vitest";

import { USD2BabylonBlock } from "../../src/Blocks/usd2BabylonBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { type BabylonAsset, IsBabylonAsset } from "../../src/representations/babylonAsset";
import { CreateHierarchicalResolvedStage, CreateMinimalResolvedStage, CreateTestUsdAsset } from "./testUsdAsset";

describe("USD2BabylonBlock", () => {
    it("has a USD_STAGE input and BABYLON_SCENE output", () => {
        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.USD_STAGE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
    });

    it("transcodes a minimal resolved stage into a BabylonAsset", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);
        block.input.value = CreateTestUsdAsset();

        await block._buildBlockAsync();

        expect(IsBabylonAsset(block.output.value)).toBe(true);
        const babylonAsset = block.output.value as BabylonAsset;
        expect(babylonAsset.engine).toBeDefined();
        expect(babylonAsset.scene).toBeDefined();
        expect(babylonAsset.scene.meshes.length).toBeGreaterThanOrEqual(1);

        babylonAsset.dispose();
    });

    it("produces a scene with the correct mesh count from a hierarchical stage", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const babylonAsset = block.output.value as BabylonAsset;
        // The hierarchical stage has 2 mesh prims (Mesh0, Mesh1)
        const realMeshes = babylonAsset.scene.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(realMeshes.length).toBeGreaterThanOrEqual(2);

        babylonAsset.dispose();
    });

    it("handles Z-up, non-metric stages", async () => {
        const stage = CreateMinimalResolvedStage();
        stage.metadata.upAxis = "Z";
        stage.metadata.metersPerUnit = 0.01;

        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const babylonAsset = block.output.value as BabylonAsset;
        expect(babylonAsset.scene).toBeDefined();
        // The scene should have a conversion root node
        expect(babylonAsset.scene.transformNodes.length).toBeGreaterThanOrEqual(1);

        babylonAsset.dispose();
    });

    it("records loss diagnostics in the manifest", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const babylonAsset = block.output.value as BabylonAsset;
        expect(babylonAsset.manifest.importedFrom).toBe("usd");
        expect(babylonAsset.manifest.format).toBe("babylon");

        babylonAsset.dispose();
    });

    it("throws when input is not a UsdAsset", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2BabylonBlock("usd2babylon", asset);
        block.input.value = "not-a-usd-asset";

        await expect(block._buildBlockAsync()).rejects.toThrow(/UsdAsset/);
    });
});
