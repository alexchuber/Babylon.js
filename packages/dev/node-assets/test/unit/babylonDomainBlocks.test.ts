import { describe, expect, it, vi } from "vitest";

import { GetBabylonMeshBlock } from "../../src/Blocks/getBabylonMeshBlock";
import { SetBabylonPropertyBlock } from "../../src/Blocks/setBabylonPropertyBlock";
import { BabylonSelectorBlock } from "../../src/Blocks/babylonSelectorBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { type NodeAssetJsonObject } from "../../src/connection/nodeAssetValueMap";
import { CreateTestBabylonAsset } from "./testBabylonAsset";

// Re-export the real draco3dgltf to avoid the global vitest stub.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

describe("GetBabylonMeshBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new GetBabylonMeshBlock("getMesh", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
        expect(block.meshName.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("retrieves mesh properties by name", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new GetBabylonMeshBlock("getMesh", asset);

        block.input.value = babylonAsset;
        block.meshName.value = "myMesh";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        expect(result.name).toBe("myMesh");
        expect(result.position).toEqual({ x: 1, y: 2, z: 3 });
        expect(result.totalVertices).toBe(3);

        babylonAsset.dispose();
    });

    it("throws when mesh is not found", async () => {
        const babylonAsset = CreateTestBabylonAsset("existingMesh");

        const asset = new NodeAsset("test");
        const block = new GetBabylonMeshBlock("getMesh", asset);

        block.input.value = babylonAsset;
        block.meshName.value = "nonExistentMesh";

        await expect(block._buildBlockAsync()).rejects.toThrow("could not find mesh");

        babylonAsset.dispose();
    });

    it("throws when no input scene is provided", async () => {
        const asset = new NodeAsset("test");
        const block = new GetBabylonMeshBlock("getMesh", asset);
        block.meshName.value = "test";

        await expect(block._buildBlockAsync()).rejects.toThrow("no input scene");
    });

    it("throws when no mesh name is provided", async () => {
        const babylonAsset = CreateTestBabylonAsset();

        const asset = new NodeAsset("test");
        const block = new GetBabylonMeshBlock("getMesh", asset);
        block.input.value = babylonAsset;
        block.meshName.value = "";

        await expect(block._buildBlockAsync()).rejects.toThrow("no mesh name");

        babylonAsset.dispose();
    });
});

describe("SetBabylonPropertyBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
        expect(block.propertyPath.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.value.type).toBe(NodeAssetConnectionPointType.JSON);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
    });

    it("sets a simple property on the scene", async () => {
        const babylonAsset = CreateTestBabylonAsset("targetMesh");

        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);

        block.input.value = babylonAsset;
        block.propertyPath.value = "ambientColor.r";
        block.value.value = 0.5;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(babylonAsset);
        expect(babylonAsset.scene.ambientColor.r).toBe(0.5);

        babylonAsset.dispose();
    });

    it("navigates an indexed property path", async () => {
        const babylonAsset = CreateTestBabylonAsset("mesh0");

        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);

        block.input.value = babylonAsset;
        block.propertyPath.value = "meshes[0].isVisible";
        block.value.value = false;

        await block._buildBlockAsync();

        expect(babylonAsset.scene.meshes[0].isVisible).toBe(false);

        babylonAsset.dispose();
    });

    it("throws when property path is invalid", async () => {
        const babylonAsset = CreateTestBabylonAsset();

        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);

        block.input.value = babylonAsset;
        block.propertyPath.value = "nonExistent.deeply.nested";
        block.value.value = 42;

        await expect(block._buildBlockAsync()).rejects.toThrow("null or undefined");

        babylonAsset.dispose();
    });

    it("throws when no input scene is provided", async () => {
        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);
        block.propertyPath.value = "test";
        block.value.value = 42;

        await expect(block._buildBlockAsync()).rejects.toThrow("no input scene");
    });

    it("throws when no property path is provided", async () => {
        const babylonAsset = CreateTestBabylonAsset();

        const asset = new NodeAsset("test");
        const block = new SetBabylonPropertyBlock("setProp", asset);
        block.input.value = babylonAsset;
        block.propertyPath.value = "";
        block.value.value = 42;

        await expect(block._buildBlockAsync()).rejects.toThrow("no property path");

        babylonAsset.dispose();
    });
});

describe("BabylonSelectorBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
        expect(block.query.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.JSON);
    });

    it("selects a mesh by unqualified name", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);

        block.input.value = babylonAsset;
        block.query.value = "myMesh";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result).toBeDefined();
        expect(result.name).toBe("myMesh");
        expect(result.position).toEqual({ x: 1, y: 2, z: 3 });

        babylonAsset.dispose();
    });

    it("selects a mesh by qualified name", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);

        block.input.value = babylonAsset;
        block.query.value = "mesh:myMesh";

        await block._buildBlockAsync();

        const result = block.output.value as NodeAssetJsonObject;
        expect(result.name).toBe("myMesh");

        babylonAsset.dispose();
    });

    it("throws for an unmatched query", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);

        block.input.value = babylonAsset;
        block.query.value = "nonExistent";

        await expect(block._buildBlockAsync()).rejects.toThrow('could not find "nonExistent"');

        babylonAsset.dispose();
    });

    it("throws for an unknown query type prefix", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);

        block.input.value = babylonAsset;
        block.query.value = "widget:foo";

        await expect(block._buildBlockAsync()).rejects.toThrow('unknown query type "widget"');

        babylonAsset.dispose();
    });

    it("throws when no input scene is provided", async () => {
        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);
        block.query.value = "test";

        await expect(block._buildBlockAsync()).rejects.toThrow("no input scene");
    });

    it("throws when no query string is provided", async () => {
        const babylonAsset = CreateTestBabylonAsset("myMesh");

        const asset = new NodeAsset("test");
        const block = new BabylonSelectorBlock("selector", asset);
        block.input.value = babylonAsset;
        block.query.value = "";

        await expect(block._buildBlockAsync()).rejects.toThrow("no query string");

        babylonAsset.dispose();
    });
});
