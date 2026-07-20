import { Document, WebIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { GenerateTangentsBlock } from "../../src/Blocks/generateTangentsBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { RecomputeNormalsBlock } from "../../src/Blocks/recomputeNormalsBlock";
import { StripAttributesBlock, UniversalAttributeKind } from "../../src/Blocks/stripAttributesBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

function CreateTriangleDocument(normal: readonly [number, number, number], clockwise = false): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = clockwise ? [0, 0, 0, 0, 1, 0, 1, 0, 0] : [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const position = document.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
    const normalAccessor = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([...normal, ...normal, ...normal]))
        .setBuffer(buffer);
    const texcoord = document
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const color = document
        .createAccessor()
        .setType("VEC4")
        .setArray(new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]))
        .setBuffer(buffer);
    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setAttribute("NORMAL", normalAccessor)
        .setAttribute("TEXCOORD_0", texcoord)
        .setAttribute("COLOR_0", color);
    document.createScene("scene").addChild(document.createNode("triangle").setMesh(document.createMesh("triangle").addPrimitive(primitive)));
    return document;
}

function GetFirstPrimitive(document: Document): Primitive {
    return document.getRoot().listMeshes()[0].listPrimitives()[0];
}

async function BuildThroughOperatorAsync(
    source: Document,
    configure: (asset: NodeAsset, importer: ImportGLTFAggregateBlock, exporter: ExportGLTFAggregateBlock) => void
): Promise<Document> {
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    const asset = new NodeAsset("attribute-operator");
    const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
    importer.data = await io.writeBinary(source);
    importer.source = "fixture.glb";
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    configure(asset, importer, exporter);
    return await io.readBinary(await asset.buildAsync());
}

describe("Universal attribute blocks", () => {
    it("preserves existing normals unless overwrite is enabled", async () => {
        const built = await BuildThroughOperatorAsync(CreateTriangleDocument([1, 0, 0]), (asset, importer, exporter) => {
            const recompute = new RecomputeNormalsBlock("Recompute Normals", asset);
            importer.output.connectTo(recompute.input);
            recompute.output.connectTo(exporter.input);

            expect(recompute.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(recompute.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        });

        expect(GetFirstPrimitive(built).getAttribute("NORMAL")?.getElement(0, [0, 0, 0])).toEqual([1, 0, 0]);
    });

    it("replaces existing normals without repairing clockwise face winding", async () => {
        const built = await BuildThroughOperatorAsync(CreateTriangleDocument([1, 0, 0], true), (asset, importer, exporter) => {
            const recompute = new RecomputeNormalsBlock("Recompute Normals", asset);
            recompute.overwriteExisting = true;
            importer.output.connectTo(recompute.input);
            recompute.output.connectTo(exporter.input);
        });

        expect(GetFirstPrimitive(built).getAttribute("NORMAL")?.getElement(0, [0, 0, 0])).toEqual([0, 0, -1]);
    });

    it("generates tangents from Universal position, normal, and texture-coordinate attributes", async () => {
        const built = await BuildThroughOperatorAsync(CreateTriangleDocument([0, 0, 1]), (asset, importer, exporter) => {
            const generateTangents = new GenerateTangentsBlock("Generate Tangents", asset);
            importer.output.connectTo(generateTangents.input);
            generateTangents.output.connectTo(exporter.input);

            expect(generateTangents.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(generateTangents.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        });

        const tangent = GetFirstPrimitive(built).getAttribute("TANGENT");
        expect(tangent?.getType()).toBe("VEC4");
        expect(tangent?.getElement(0, [0, 0, 0, 0])).toEqual([1, 0, 0, -1]);
    });

    it("removes only the selected attribute kinds", async () => {
        const built = await BuildThroughOperatorAsync(CreateTriangleDocument([0, 0, 1]), (asset, importer, exporter) => {
            const strip = new StripAttributesBlock("Strip Attributes", asset);
            strip.selectedAttributeKinds = [UniversalAttributeKind.Color, UniversalAttributeKind.TextureCoordinate];
            importer.output.connectTo(strip.input);
            strip.output.connectTo(exporter.input);

            expect(strip.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(strip.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        });

        expect(GetFirstPrimitive(built).listSemantics()).toEqual(["POSITION", "NORMAL"]);
        expect(built.getRoot().listAccessors()).toHaveLength(2);
    });

    it("round-trips a representative attribute chain and builds a downstream-readable GLB", async () => {
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const asset = new NodeAsset("attribute-chain");
        const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
        importer.data = await io.writeBinary(CreateTriangleDocument([1, 0, 0]));
        importer.source = "fixture.glb";
        const recompute = new RecomputeNormalsBlock("Recompute Normals", asset);
        recompute.overwriteExisting = true;
        const generateTangents = new GenerateTangentsBlock("Generate Tangents", asset);
        const strip = new StripAttributesBlock("Strip Attributes", asset);
        strip.selectedAttributeKinds = [UniversalAttributeKind.Color];
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        importer.output.connectTo(recompute.input);
        recompute.output.connectTo(generateTangents.input);
        generateTangents.output.connectTo(strip.input);
        strip.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);
        const parsedRecompute = parsed.attachedBlocks.find((block) => block instanceof RecomputeNormalsBlock) as RecomputeNormalsBlock;
        const parsedGenerateTangents = parsed.attachedBlocks.find((block) => block instanceof GenerateTangentsBlock);
        const parsedStrip = parsed.attachedBlocks.find((block) => block instanceof StripAttributesBlock) as StripAttributesBlock;

        expect(parsedRecompute.overwriteExisting).toBe(true);
        expect(parsedGenerateTangents).toBeInstanceOf(GenerateTangentsBlock);
        expect(parsedStrip.selectedAttributeKinds).toEqual([UniversalAttributeKind.Color]);

        const result = await parsed.buildAsync();
        const built = await io.readBinary(result);
        expect(result.byteLength).toBeGreaterThan(0);
        expect(GetFirstPrimitive(built).listSemantics().sort()).toEqual(["NORMAL", "POSITION", "TANGENT", "TEXCOORD_0"]);
    });
});
