import { Document } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { USD2GLTFBlock } from "../../src/Blocks/usd2GLTFBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { type GltfAsset, IsGltfAsset } from "../../src/representations/gltfAsset";
import { CreateHierarchicalResolvedStage, CreateMinimalResolvedStage, CreateTestUsdAsset } from "./testUsdAsset";

describe("USD2GLTFBlock", () => {
    it("has a USD_STAGE input and GLTF_DOCUMENT output", () => {
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);

        expect(block.inputs).toHaveLength(1);
        expect(block.outputs).toHaveLength(1);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.USD_STAGE);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("transcodes a minimal resolved stage into a glTF Document", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset();

        await block._buildBlockAsync();

        expect(IsGltfAsset(block.output.value)).toBe(true);
        const gltfAsset = block.output.value as GltfAsset;
        const document = gltfAsset.document;
        expect(document).toBeInstanceOf(Document);
        expect(document.getRoot().listMeshes().length).toBeGreaterThanOrEqual(1);
    });

    it("maps resolved materials onto glTF PBR materials", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset();

        await block._buildBlockAsync();

        const gltfAsset = block.output.value as GltfAsset;
        const materials = gltfAsset.document.getRoot().listMaterials();
        expect(materials).toHaveLength(1);
        const mat = materials[0];
        expect(mat.getName()).toBe("DefaultMat");
        const baseColor = mat.getBaseColorFactor();
        expect(baseColor[0]).toBeCloseTo(0.8, 2);
        expect(baseColor[1]).toBeCloseTo(0.2, 2);
        expect(baseColor[2]).toBeCloseTo(0.2, 2);
    });

    it("preserves mesh geometry from the resolved stage", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset();

        await block._buildBlockAsync();

        const gltfAsset = block.output.value as GltfAsset;
        const meshes = gltfAsset.document.getRoot().listMeshes();
        expect(meshes).toHaveLength(1);
        const primitive = meshes[0].listPrimitives()[0];
        expect(primitive.getAttribute("POSITION")?.getCount()).toBe(3);
        expect(primitive.getIndices()?.getCount()).toBe(3);
    });

    it("wraps Z-up stages in a conversion node", async () => {
        const stage = CreateMinimalResolvedStage();
        stage.metadata.upAxis = "Z";
        stage.metadata.metersPerUnit = 0.01;

        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const gltfAsset = block.output.value as GltfAsset;
        const sceneChildren = gltfAsset.document.getRoot().listScenes()[0].listChildren();
        expect(sceneChildren).toHaveLength(1);
        expect(sceneChildren[0].getName()).toBe("USD_Root");
        expect(sceneChildren[0].getScale()[0]).toBeCloseTo(0.01, 5);
        expect(sceneChildren[0].getRotation()[0]).toBeCloseTo(-Math.SQRT1_2, 5);
    });

    it("records resolution diagnostics as loss records in the manifest", async () => {
        const stage = CreateHierarchicalResolvedStage();
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const gltfAsset = block.output.value as GltfAsset;
        expect(gltfAsset.manifest.importedFrom).toBe("usd");
        expect(gltfAsset.manifest.format).toBe("gltf");
    });

    it("carries over diagnostics from the UsdAsset into the GltfAsset manifest", async () => {
        const stage = CreateHierarchicalResolvedStage();
        stage.diagnostics.push({ severity: "warning", message: "dropped feature", path: "/World/X" });

        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = CreateTestUsdAsset(stage);

        await block._buildBlockAsync();

        const gltfAsset = block.output.value as GltfAsset;
        const diagnostics = gltfAsset.manifest.diagnostics as Array<{ message: string }>;
        expect(diagnostics).toBeDefined();
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics.some((d) => d.message.includes("dropped feature"))).toBe(true);
    });

    it("throws when input is not a UsdAsset", async () => {
        const asset = new NodeAsset("test");
        const block = new USD2GLTFBlock("usd2gltf", asset);
        block.input.value = "not-a-usd-asset";

        await expect(block._buildBlockAsync()).rejects.toThrow(/UsdAsset/);
    });
});
