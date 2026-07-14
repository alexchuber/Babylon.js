import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { BuildPBRMaterial } from "../../src/Blocks/buildPBRMaterial";
import { CenterBlock } from "../../src/Blocks/centerBlock";
import { DedupBlock } from "../../src/Blocks/dedupBlock";
import { DracoCompressionBlock } from "../../src/Blocks/dracoCompressionBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ExtractTexture } from "../../src/Blocks/extractTexture";
import { FlattenBlock } from "../../src/Blocks/flattenBlock";
import { GetProperty } from "../../src/Blocks/getProperty";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { ImportUSDBlock } from "../../src/Blocks/importUSDBlock";
import { JoinBlock } from "../../src/Blocks/joinBlock";
import { KTX2CompressionBlock } from "../../src/Blocks/ktx2CompressionBlock";
import { MergeScenes } from "../../src/Blocks/mergeScenes";
import { NormalsBlock } from "../../src/Blocks/normalsBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { QuantizeBlock } from "../../src/Blocks/quantizeBlock";
import { SetProperty } from "../../src/Blocks/setProperty";
import { SetTexture } from "../../src/Blocks/setTexture";
import { SimplifyBlock } from "../../src/Blocks/simplifyBlock";
import { WeldBlock } from "../../src/Blocks/weldBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { GltfAsset } from "../../src/representations/gltfAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    document.createScene("scene");
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

describe("glTF representation paths", () => {
    it("exposes every existing glTF block seam as GLTF_DOCUMENT without changing point names", () => {
        const nodeAsset = new NodeAsset("gltf-ports");
        const importer = new ImportGLTFBlock("import", nodeAsset);
        const legacyUsdImporter = new ImportUSDBlock("legacy-usd", nodeAsset);
        const exporter = new ExportGLTFBlock("export", nodeAsset);
        const operators = [
            new DedupBlock("dedup", nodeAsset),
            new PruneBlock("prune", nodeAsset),
            new WeldBlock("weld", nodeAsset),
            new QuantizeBlock("quantize", nodeAsset),
            new SimplifyBlock("simplify", nodeAsset),
            new FlattenBlock("flatten", nodeAsset),
            new CenterBlock("center", nodeAsset),
            new NormalsBlock("normals", nodeAsset),
            new JoinBlock("join", nodeAsset),
            new DracoCompressionBlock("draco", nodeAsset),
            new KTX2CompressionBlock("ktx2", nodeAsset),
        ];
        const merge = new MergeScenes("merge", nodeAsset);
        const getter = new GetProperty("get", nodeAsset);
        const setter = new SetProperty("set", nodeAsset);
        const extract = new ExtractTexture("extract", nodeAsset);
        const setTexture = new SetTexture("set-texture", nodeAsset);
        const buildMaterial = new BuildPBRMaterial("build-material", nodeAsset);

        const gltfPoints = [
            importer.output,
            legacyUsdImporter.output,
            exporter.input,
            ...operators.flatMap((operator) => [operator.input, operator.output]),
            ...merge.inputs,
            merge.output,
            getter.scene,
            setter.scene,
            setter.output,
            extract.scene,
            setTexture.scene,
            setTexture.output,
            buildMaterial.scene,
            buildMaterial.output,
        ];

        expect(gltfPoints.every((point) => point.type === NodeAssetConnectionPointType.GLTF_DOCUMENT)).toBe(true);
        expect(importer.output.name).toBe("output");
        expect(exporter.input.name).toBe("input");
        expect(operators.every((operator) => operator.input.name === "input" && operator.output.name === "output")).toBe(true);
        expect(merge.inputs.map((input) => input.name)).toEqual(["input0", "input1"]);
        expect(setter.scene.name).toBe("scene");
        expect(setTexture.scene.name).toBe("scene");
        expect(buildMaterial.scene.name).toBe("scene");
    });

    it("carries GltfAsset through import, an operator, and export on GLTF_DOCUMENT points", async () => {
        const nodeAsset = new NodeAsset("typed-gltf");
        const importer = new ImportGLTFBlock("import", nodeAsset);
        importer.source = "fixture.glb";
        importer.data = await CreateFixtureGlbAsync();
        const operator = new DedupBlock("dedup", nodeAsset);
        const exporter = new ExportGLTFBlock("export", nodeAsset);

        expect(importer.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(operator.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(operator.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(exporter.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);

        await importer._buildBlockAsync();
        expect(importer.output.value).toBeInstanceOf(GltfAsset);
        const imported = importer.output.value as GltfAsset;
        expect(imported.identity).toBe("fixture.glb");

        operator.input.value = imported;
        await operator._buildBlockAsync();
        expect(operator.output.value).toBe(imported);

        exporter.input.value = operator.output.value;
        await exporter._buildBlockAsync();
        expect(exporter.result).toBeInstanceOf(Uint8Array);
    });
});
