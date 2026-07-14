import { describe, expect, it } from "vitest";

import { USDSelectorBlock } from "../../src/Blocks/usdSelectorBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonArray, type NodeAssetJsonObject } from "../../src/connection/nodeAssetValueMap";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateHierarchicalResolvedStage, CreateTestUsdAsset } from "./testUsdAsset";

describe("USDSelectorBlock", () => {
    it("has USD_STAGE and STRING inputs and a JSON output", () => {
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);

        expect(block.inputs).toHaveLength(2);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.USD_STAGE);
        expect(block.query.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("selects prims by exact path", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/World/GroupA/Mesh0";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        expect(results).toHaveLength(1);
        const prim = results[0] as NodeAssetJsonObject;
        expect(prim.path).toBe("/World/GroupA/Mesh0");
        expect(prim.name).toBe("Mesh0");
        expect(prim.kind).toBe("mesh");
    });

    it("selects multiple prims with a glob pattern using *", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/World/GroupA/*";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        expect(results).toHaveLength(2);
        const paths = results.map((r) => (r as NodeAssetJsonObject).path);
        expect(paths).toContain("/World/GroupA/Mesh0");
        expect(paths).toContain("/World/GroupA/Mesh1");
    });

    it("selects prims recursively with ** glob", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/World/**";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        // Should find all descendants of /World: GroupA, Mesh0, Mesh1, GroupB, Light0, Camera0
        expect(results.length).toBeGreaterThanOrEqual(6);
        const paths = results.map((r) => (r as NodeAssetJsonObject).path);
        expect(paths).toContain("/World/GroupA");
        expect(paths).toContain("/World/GroupA/Mesh0");
        expect(paths).toContain("/World/GroupB/Light0");
        expect(paths).toContain("/World/Camera0");
    });

    it("filters prims by kind when query includes kind: prefix", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/World/**/kind:mesh";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        expect(results).toHaveLength(2);
        for (const r of results) {
            expect((r as NodeAssetJsonObject).kind).toBe("mesh");
        }
    });

    it("returns an empty array when no prims match", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/NonExistent/*";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        expect(results).toHaveLength(0);
    });

    it("returns prim metadata without full property serialization", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.query.value = "/World/GroupA/Mesh0";

        await block._buildBlockAsync();

        const results = block.output.value as NodeAssetJsonArray;
        const prim = results[0] as NodeAssetJsonObject;
        expect(prim.path).toBeDefined();
        expect(prim.name).toBeDefined();
        expect(prim.kind).toBeDefined();
        expect(prim.visible).toBeDefined();
    });

    it("throws when input is not a UsdAsset", async () => {
        const asset = new NodeAsset("test");
        const block = new USDSelectorBlock("selector", asset);
        block.input.value = "not-a-usd-asset";
        block.query.value = "/World";

        await expect(block._buildBlockAsync()).rejects.toThrow(/UsdAsset/);
    });
});
