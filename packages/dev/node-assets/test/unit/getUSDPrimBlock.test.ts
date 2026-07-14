import { describe, expect, it } from "vitest";

import { GetUSDPrimBlock } from "../../src/Blocks/getUSDPrimBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../../src/connection/nodeAssetValueMap";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateHierarchicalResolvedStage, CreateTestUsdAsset } from "./testUsdAsset";

describe("GetUSDPrimBlock", () => {
    it("has USD_STAGE and STRING inputs and a JSON output", () => {
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);

        expect(block.inputs).toHaveLength(2);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.USD_STAGE);
        expect(block.primPath.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("retrieves a prim by exact path and serializes its properties", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/GroupA/Mesh0";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        expect(result.path).toBe("/World/GroupA/Mesh0");
        expect(result.name).toBe("Mesh0");
        expect(result.kind).toBe("mesh");
        expect(result.visible).toBe(true);
    });

    it("includes the prim's mesh index when the prim is a mesh", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/GroupA/Mesh0";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.meshIndex).toBe(0);
    });

    it("retrieves a transform prim with its children listed", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/GroupA";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.path).toBe("/World/GroupA");
        expect(result.kind).toBe("transform");
        const childPaths = result.childPaths as string[];
        expect(childPaths).toContain("/World/GroupA/Mesh0");
        expect(childPaths).toContain("/World/GroupA/Mesh1");
    });

    it("includes light parameters for a light prim", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/GroupB/Light0";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.kind).toBe("light");
        const light = result.light as NodeAssetJsonObject;
        expect(light).toBeDefined();
        expect(light.kind).toBe("distant");
        expect(light.intensity).toBe(500);
    });

    it("includes camera parameters for a camera prim", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/Camera0";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.kind).toBe("camera");
        const camera = result.camera as NodeAssetJsonObject;
        expect(camera).toBeDefined();
        expect(camera.projection).toBe("perspective");
        expect(camera.focalLength).toBe(50);
    });

    it("throws a diagnostic error for an invalid prim path", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/World/NonExistent";

        await expect(block._buildBlockAsync()).rejects.toThrow(/not found/i);
    });

    it("throws when the path does not start with /", async () => {
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset();
        block.primPath.value = "World/Mesh0";

        await expect(block._buildBlockAsync()).rejects.toThrow();
    });

    it("retrieves the root prim itself with path /", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = CreateTestUsdAsset(stage);
        block.primPath.value = "/";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.path).toBe("/");
        expect(result.kind).toBe("transform");
    });

    it("throws when input is not a UsdAsset", async () => {
        const asset = new NodeAsset("test");
        const block = new GetUSDPrimBlock("getPrim", asset);
        block.input.value = "not-a-usd-asset";
        block.primPath.value = "/World";

        await expect(block._buildBlockAsync()).rejects.toThrow(/UsdAsset/);
    });
});
