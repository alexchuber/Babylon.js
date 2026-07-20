import { type Accessor, type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { QuantizationVolume, QuantizeAttributesBlock } from "../../src/Blocks/quantizeAttributesBlock";
import { SimplifyMeshesBlock } from "../../src/Blocks/simplifyMeshesBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { CreateTestGltfAsset } from "./testGltfAsset";

const GL_BYTE = 5120;
const GL_UNSIGNED_BYTE = 5121;
const GL_SHORT = 5122;
const GL_UNSIGNED_SHORT = 5123;
const GL_FLOAT = 5126;

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateAttributeFixtureAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const createAccessor = (type: Accessor.Type, values: number[]) => document.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);

    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", createAccessor("VEC3", [0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setAttribute("NORMAL", createAccessor("VEC3", [0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setAttribute("TEXCOORD_0", createAccessor("VEC2", [0, 0, 1, 0, 0, 1]))
        .setAttribute("COLOR_0", createAccessor("VEC4", [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]))
        .setAttribute("WEIGHTS_0", createAccessor("VEC4", [0.4, 0.2, 0.1, 0.1, 0.4, 0.2, 0.1, 0.1, 0.4, 0.2, 0.1, 0.1]))
        .setAttribute("_CUSTOM", createAccessor("SCALAR", [0, 0.5, 1]))
        .setAttribute("_SKIP", createAccessor("SCALAR", [0, 0.5, 1]))
        .setIndices(
            document
                .createAccessor()
                .setType("SCALAR")
                .setArray(new Uint32Array([0, 1, 2]))
                .setBuffer(buffer)
        )
        .addTarget(document.createPrimitiveTarget().setAttribute("POSITION", createAccessor("VEC3", [0, 0, 0, 0.1, 0, 0, 0, 0.1, 0])));
    const mesh = document.createMesh("attribute fixture").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("fixture").setMesh(mesh));
    createAccessor("SCALAR", [1]).setName("orphan");
    return document;
}

async function CreateQuantizationVolumeFixtureAsync(): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const scene = document.createScene("scene");
    for (const [name, size] of [
        ["small", 1],
        ["large", 10],
    ] as const) {
        const position = document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, size, 0, 0, 0, size, 0]))
            .setBuffer(buffer);
        const mesh = document.createMesh(name).addPrimitive(document.createPrimitive().setAttribute("POSITION", position));
        scene.addChild(document.createNode(name).setMesh(mesh));
    }
    return document;
}

async function CreateGridDocumentAsync(cells = 12): Promise<Document> {
    const { Document } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const side = cells + 1;
    const positions: number[] = [];
    for (let z = 0; z < side; z++) {
        for (let x = 0; x < side; x++) {
            positions.push(x, 0.1 * Math.sin(x) * Math.cos(z), z);
        }
    }

    const indices: number[] = [];
    for (let z = 0; z < cells; z++) {
        for (let x = 0; x < cells; x++) {
            const topLeft = z * side + x;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + side;
            const bottomRight = bottomLeft + 1;
            indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
        }
    }

    const position = document.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
    const index = document.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer);
    const mesh = document.createMesh("grid").addPrimitive(document.createPrimitive().setAttribute("POSITION", position).setIndices(index));
    document.createScene("scene").addChild(document.createNode("grid").setMesh(mesh));
    return document;
}

function GetAttribute(document: Document, semantic: string): Accessor {
    const attribute = document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute(semantic);
    if (!attribute) {
        throw new Error(`Missing test attribute "${semantic}".`);
    }
    return attribute;
}

function GetIndexCount(document: Document): number {
    return document.getRoot().listMeshes()[0].listPrimitives()[0].getIndices()!.getCount();
}

function CountBoundaryVertices(document: Document, maximumCoordinate: number): number {
    const position = GetAttribute(document, "POSITION");
    const value: number[] = [];
    let count = 0;
    for (let index = 0; index < position.getCount(); index++) {
        position.getElement(index, value);
        if (value[0] === 0 || value[0] === maximumCoordinate || value[2] === 0 || value[2] === maximumCoordinate) {
            count++;
        }
    }
    return count;
}

async function WriteGlbAsync(document: Document): Promise<Uint8Array> {
    const { WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function ReadGlbAsync(glb: Uint8Array): Promise<Document> {
    const { WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
}

describe("QuantizeAttributesBlock", () => {
    it("publishes exact Universal input and output seams", () => {
        const block = new QuantizeAttributesBlock("Quantize Attributes", new NodeAsset("quantize attributes"));

        expect(block.getClassName()).toBe("QuantizeAttributesBlock");
        expect(block.inputs).toEqual([block.input]);
        expect(block.outputs).toEqual([block.output]);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
    });

    it("serializes and restores every approved option", () => {
        const asset = new NodeAsset("quantize attributes options");
        const block = new QuantizeAttributesBlock("Quantize Attributes", asset);
        block.positionBits = 8;
        block.normalBits = 9;
        block.textureCoordinateBits = 10;
        block.colorBits = 11;
        block.weightBits = 12;
        block.genericBits = 13;
        block.normalizeWeights = false;
        block.attributePattern = "^POSITION|NORMAL$";
        block.morphTargetPattern = "^POSITION$";
        block.quantizationVolume = QuantizationVolume.Scene;
        block.cleanup = false;

        const serialized = asset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: "QuantizeAttributesBlock",
            positionBits: 8,
            normalBits: 9,
            textureCoordinateBits: 10,
            colorBits: 11,
            weightBits: 12,
            genericBits: 13,
            normalizeWeights: false,
            attributePattern: "^POSITION|NORMAL$",
            morphTargetPattern: "^POSITION$",
            quantizationVolume: "scene",
            cleanup: false,
        });

        const restored = NodeAsset.Parse(serialized).attachedBlocks[0] as QuantizeAttributesBlock;
        expect(restored).toBeInstanceOf(QuantizeAttributesBlock);
        expect(restored.positionBits).toBe(8);
        expect(restored.normalBits).toBe(9);
        expect(restored.textureCoordinateBits).toBe(10);
        expect(restored.colorBits).toBe(11);
        expect(restored.weightBits).toBe(12);
        expect(restored.genericBits).toBe(13);
        expect(restored.normalizeWeights).toBe(false);
        expect(restored.attributePattern).toBe("^POSITION|NORMAL$");
        expect(restored.morphTargetPattern).toBe("^POSITION$");
        expect(restored.quantizationVolume).toBe(QuantizationVolume.Scene);
        expect(restored.cleanup).toBe(false);
    });

    it.each([
        ["positionBits", 7],
        ["normalBits", 17],
        ["textureCoordinateBits", 8.5],
        ["colorBits", 0],
        ["weightBits", 32],
        ["genericBits", 12.5],
        ["normalizeWeights", "yes"],
        ["attributePattern", "("],
        ["morphTargetPattern", "["],
        ["quantizationVolume", "global"],
        ["cleanup", 1],
    ])("rejects invalid serialized %s", (property, value) => {
        const block = new QuantizeAttributesBlock("Quantize Attributes", new NodeAsset("invalid quantize attributes"));
        const serializedBlock = { ...block.serialize(), [property]: value };
        expect(() => NodeAsset.Parse({ name: "invalid", blocks: [serializedBlock], connections: [] })).toThrow("Invalid serialized block property");
    });

    it("forwards precision, attribute filtering, and morph-target filtering to quantization", async () => {
        const document = await CreateAttributeFixtureAsync();
        const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
        const targetPosition = primitive.listTargets()[0].getAttribute("POSITION")!;
        expect(GetAttribute(document, "POSITION").getComponentType()).toBe(GL_FLOAT);
        expect(targetPosition.getComponentType()).toBe(GL_FLOAT);

        const block = new QuantizeAttributesBlock("Quantize Attributes", new NodeAsset("quantize facts"));
        block.positionBits = 8;
        block.normalBits = 9;
        block.textureCoordinateBits = 8;
        block.colorBits = 9;
        block.weightBits = 8;
        block.genericBits = 9;
        block.normalizeWeights = false;
        block.attributePattern = "^(POSITION|NORMAL|TEXCOORD_0|COLOR_0|WEIGHTS_0|_CUSTOM)$";
        block.morphTargetPattern = "^NORMAL$";
        block.cleanup = false;
        const universal = CreateTestGltfAsset(document);
        block.input.value = universal;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(universal);
        expect(GetAttribute(document, "POSITION").getComponentType()).toBe(GL_BYTE);
        expect(GetAttribute(document, "NORMAL").getComponentType()).toBe(GL_SHORT);
        expect(GetAttribute(document, "TEXCOORD_0").getComponentType()).toBe(GL_UNSIGNED_BYTE);
        expect(GetAttribute(document, "COLOR_0").getComponentType()).toBe(GL_UNSIGNED_SHORT);
        expect(GetAttribute(document, "WEIGHTS_0").getComponentType()).toBe(GL_UNSIGNED_BYTE);
        expect(GetAttribute(document, "_CUSTOM").getComponentType()).toBe(GL_UNSIGNED_SHORT);
        expect(GetAttribute(document, "_SKIP").getComponentType()).toBe(GL_FLOAT);
        const quantizedWeights: number[] = [];
        GetAttribute(document, "WEIGHTS_0").getElement(0, quantizedWeights);
        expect(quantizedWeights.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.9);
        expect(targetPosition.getComponentType()).toBe(GL_FLOAT);
        expect(
            document
                .getRoot()
                .listAccessors()
                .some((accessor) => accessor.getName() === "orphan")
        ).toBe(true);
        expect(
            document
                .getRoot()
                .listExtensionsUsed()
                .map((extension) => extension.extensionName)
        ).toContain("KHR_mesh_quantization");
    });

    it("uses shared scene bounds when the quantization volume is Scene", async () => {
        const document = await CreateQuantizationVolumeFixtureAsync();
        const block = new QuantizeAttributesBlock("Quantize Attributes", new NodeAsset("scene quantization volume"));
        block.quantizationVolume = QuantizationVolume.Scene;
        block.cleanup = false;
        block.input.value = CreateTestGltfAsset(document);

        await block._buildBlockAsync();

        const [smallNode, largeNode] = document.getRoot().listNodes();
        expect(smallNode.getMatrix()).toEqual(largeNode.getMatrix());
    });

    it("rejects a build without Universal input", async () => {
        const block = new QuantizeAttributesBlock("Quantize Attributes", new NodeAsset("missing quantize input"));

        await expect(block._buildBlockAsync()).rejects.toThrow("has no input document");
    });
});

describe("SimplifyMeshesBlock", () => {
    it("publishes exact Universal input and output seams", () => {
        const block = new SimplifyMeshesBlock("Simplify Meshes", new NodeAsset("simplify meshes"));

        expect(block.getClassName()).toBe("SimplifyMeshesBlock");
        expect(block.inputs).toEqual([block.input]);
        expect(block.outputs).toEqual([block.output]);
        expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
    });

    it("serializes and restores every approved option", () => {
        const asset = new NodeAsset("simplify meshes options");
        const block = new SimplifyMeshesBlock("Simplify Meshes", asset);
        block.targetRatio = 0.25;
        block.errorLimit = 0.125;
        block.lockBorder = true;

        const serialized = asset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: "SimplifyMeshesBlock",
            targetRatio: 0.25,
            errorLimit: 0.125,
            lockBorder: true,
        });

        const restored = NodeAsset.Parse(serialized).attachedBlocks[0] as SimplifyMeshesBlock;
        expect(restored).toBeInstanceOf(SimplifyMeshesBlock);
        expect(restored.targetRatio).toBe(0.25);
        expect(restored.errorLimit).toBe(0.125);
        expect(restored.lockBorder).toBe(true);
    });

    it.each([
        ["targetRatio", -0.01],
        ["targetRatio", 1.01],
        ["errorLimit", -0.01],
        ["errorLimit", 1.01],
        ["lockBorder", "yes"],
    ])("rejects invalid serialized %s", (property, value) => {
        const block = new SimplifyMeshesBlock("Simplify Meshes", new NodeAsset("invalid simplify meshes"));
        const serializedBlock = { ...block.serialize(), [property]: value };
        expect(() => NodeAsset.Parse({ name: "invalid", blocks: [serializedBlock], connections: [] })).toThrow("Invalid serialized block property");
    });

    it("reduces mesh geometry and preserves a valid Universal payload", async () => {
        const document = await CreateGridDocumentAsync();
        const before = GetIndexCount(document);
        const block = new SimplifyMeshesBlock("Simplify Meshes", new NodeAsset("simplify facts"));
        block.targetRatio = 0.25;
        block.errorLimit = 1;
        block.lockBorder = true;
        const universal = CreateTestGltfAsset(document);
        block.input.value = universal;

        await block._buildBlockAsync();

        expect(block.output.value).toBe(universal);
        expect(GetIndexCount(document)).toBeGreaterThan(0);
        expect(GetIndexCount(document)).toBeLessThan(before);
        expect(CountBoundaryVertices(document, 12)).toBe(48);
    });

    it("rejects a build without Universal input", async () => {
        const block = new SimplifyMeshesBlock("Simplify Meshes", new NodeAsset("missing simplify input"));

        await expect(block._buildBlockAsync()).rejects.toThrow("has no input document");
    });
});

describe("Universal reduction composition", () => {
    it.each([
        ["Quantize Attributes then Simplify Meshes", "quantize-first"],
        ["Simplify Meshes then Quantize Attributes", "simplify-first"],
    ] as const)(
        "%s builds a non-empty valid GLB",
        async (_name, order) => {
            const source = await WriteGlbAsync(await CreateGridDocumentAsync());
            const asset = new NodeAsset(order);
            const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
            importer.setUploadedSource(source, "grid.glb");
            const quantize = new QuantizeAttributesBlock("Quantize Attributes", asset);
            quantize.cleanup = false;
            const simplify = new SimplifyMeshesBlock("Simplify Meshes", asset);
            simplify.targetRatio = 0.5;
            simplify.errorLimit = 1;
            const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
            const first = order === "quantize-first" ? quantize : simplify;
            const second = order === "quantize-first" ? simplify : quantize;
            importer.output.connectTo(first.input);
            first.output.connectTo(second.input);
            second.output.connectTo(exporter.input);

            const glb = await asset.buildAsync();
            expect(glb.length).toBeGreaterThan(0);
            expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe("glTF");

            const document = await ReadGlbAsync(glb);
            expect(document.getRoot().listMeshes()).toHaveLength(1);
            expect(GetIndexCount(document)).toBeGreaterThan(0);
        },
        30000
    );
});
