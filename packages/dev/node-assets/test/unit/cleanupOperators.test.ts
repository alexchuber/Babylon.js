import { Document, PropertyType, WebIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { FixFaceWindingBlock } from "../../src/Blocks/fixFaceWindingBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { RemoveDegenerateGeometryBlock } from "../../src/Blocks/removeDegenerateGeometryBlock";
import { RemoveUnusedResourcesBlock } from "../../src/Blocks/removeUnusedResourcesBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { WeldBlock } from "../../src/Blocks/weldBlock";
import { WeldVerticesBlock } from "../../src/Blocks/weldVerticesBlock";
import { type NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const IO = new WebIO().registerExtensions(ALL_EXTENSIONS);

async function BuildWithOperatorsAsync(document: Document, createOperators: (asset: NodeAsset) => readonly NodeAssetBlock[]): Promise<Document> {
    const source = await IO.writeBinary(document);
    const asset = new NodeAsset("cleanup");
    const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
    importer.setUploadedSource(source, "fixture.glb");
    const operators = createOperators(asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);

    let output = importer.output;
    for (const operator of operators) {
        output.connectTo(operator.inputs[0]);
        output = operator.outputs[0];
    }
    output.connectTo(exporter.input);

    return await IO.readBinary(await asset.buildAsync());
}

async function BuildWithOperatorAsync(document: Document, createOperator: (asset: NodeAsset) => NodeAssetBlock): Promise<Document> {
    return await BuildWithOperatorsAsync(document, (asset) => [createOperator(asset)]);
}

function GetOnlyPrimitive(document: Document): Primitive {
    return document.getRoot().listMeshes()[0].listPrimitives()[0];
}

async function CreateUnweldedQuadAsync(): Promise<Document> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions);
    const mesh = document.createMesh("quad").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("quad").setMesh(mesh));
    return document;
}

async function CreateDocumentWithUnusedResourcesAsync(): Promise<Document> {
    const document = await CreateUnweldedQuadAsync();
    document.createMaterial("unused-material");
    document.getRoot().listScenes()[0].addChild(document.createNode("empty-leaf"));
    return document;
}

function CreateDocumentWithDegenerateTriangle(): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0]))
        .setBuffer(buffer);
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2, 0, 1, 3]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);
    const mesh = document.createMesh("triangles").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("triangles").setMesh(mesh));
    return document;
}

function CreateDocumentWithOnlyDegenerateGeometry(): Document {
    const document = CreateDocumentWithDegenerateTriangle();
    GetOnlyPrimitive(document)
        .getIndices()
        ?.setArray(new Uint16Array([0, 1, 3]));
    return document;
}

function CreateDocumentWithInconsistentWinding(): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]))
        .setBuffer(buffer);
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2, 1, 2, 3]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);
    const mesh = document.createMesh("quad").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("quad").setMesh(mesh));
    return document;
}

function CreateDocumentWithReversedFaceAndNormals(): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const normals = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 2, 1]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setAttribute("NORMAL", normals).setIndices(indices);
    const mesh = document.createMesh("triangle").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("triangle").setMesh(mesh));
    return document;
}

function CreateDocumentWithNonIndexedReversedFaceAndNormals(): Document {
    const document = CreateDocumentWithReversedFaceAndNormals();
    const primitive = GetOnlyPrimitive(document);
    primitive.getAttribute("POSITION")?.setArray(new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]));
    primitive.setIndices(null);
    return document;
}

function CreateDocumentWithSharedWindingIndices(): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 2, 1]))
        .setBuffer(buffer);
    const normals = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const firstPositions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const secondPositions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]))
        .setBuffer(buffer);
    const mesh = document
        .createMesh("triangles")
        .addPrimitive(document.createPrimitive().setAttribute("POSITION", firstPositions).setAttribute("NORMAL", normals).setIndices(indices))
        .addPrimitive(document.createPrimitive().setAttribute("POSITION", secondPositions).setAttribute("NORMAL", normals).setIndices(indices));
    document.createScene("scene").addChild(document.createNode("triangles").setMesh(mesh));
    return document;
}

describe("Universal cleanup operators", () => {
    it("Weld Vertices merges duplicate vertices through the public Universal build seam", async () => {
        const built = await BuildWithOperatorAsync(await CreateUnweldedQuadAsync(), (asset) => {
            const block = new WeldVerticesBlock("Weld Vertices", asset);
            expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            return block;
        });
        const primitive = GetOnlyPrimitive(built);

        expect(primitive.getAttribute("POSITION")?.getCount()).toBe(4);
        expect(primitive.getIndices()?.getCount()).toBe(6);
    });

    it("Remove Unused Resources removes orphaned resources through the public Universal build seam", async () => {
        const built = await BuildWithOperatorAsync(await CreateDocumentWithUnusedResourcesAsync(), (asset) => {
            const block = new RemoveUnusedResourcesBlock("Remove Unused Resources", asset);
            expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            return block;
        });

        expect(built.getRoot().listMaterials()).toHaveLength(0);
        expect(
            built
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).toEqual(["quad"]);
    });

    it("Remove Degenerate Geometry drops zero-area triangles through the public Universal build seam", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithDegenerateTriangle(), (asset) => {
            const block = new RemoveDegenerateGeometryBlock("Remove Degenerate Geometry", asset);
            expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            return block;
        });

        expect(Array.from(GetOnlyPrimitive(built).getIndices()?.getArray() ?? [])).toEqual([0, 1, 2]);
    });

    it("Remove Degenerate Geometry leaves a valid asset when a mesh contains no usable triangles", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithOnlyDegenerateGeometry(), (asset) => new RemoveDegenerateGeometryBlock("Remove Degenerate Geometry", asset));

        expect(built.getRoot().listMeshes()).toHaveLength(0);
    });

    it("Fix Face Winding makes adjacent triangles consistent through the public Universal build seam", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithInconsistentWinding(), (asset) => {
            const block = new FixFaceWindingBlock("Fix Face Winding", asset);
            expect(block.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            expect(block.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
            return block;
        });

        expect(Array.from(GetOnlyPrimitive(built).getIndices()?.getArray() ?? [])).toEqual([0, 1, 2, 1, 3, 2]);
    });

    it("Fix Face Winding aligns an isolated face with its existing normals without recomputing them", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithReversedFaceAndNormals(), (asset) => new FixFaceWindingBlock("Fix Face Winding", asset));
        const primitive = GetOnlyPrimitive(built);

        expect(Array.from(primitive.getIndices()?.getArray() ?? [])).toEqual([0, 1, 2]);
        expect(Array.from(primitive.getAttribute("NORMAL")?.getArray() ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    });

    it("Fix Face Winding handles non-indexed triangles through the public Universal build seam", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithNonIndexedReversedFaceAndNormals(), (asset) => new FixFaceWindingBlock("Fix Face Winding", asset));

        expect(Array.from(GetOnlyPrimitive(built).getIndices()?.getArray() ?? [])).toEqual([0, 2, 1]);
    });

    it("Fix Face Winding isolates shared index accessors before changing one primitive", async () => {
        const built = await BuildWithOperatorAsync(CreateDocumentWithSharedWindingIndices(), (asset) => new FixFaceWindingBlock("Fix Face Winding", asset));
        const primitives = built.getRoot().listMeshes()[0].listPrimitives();

        expect(Array.from(primitives[0].getIndices()?.getArray() ?? [])).toEqual([0, 1, 2]);
        expect(Array.from(primitives[1].getIndices()?.getArray() ?? [])).toEqual([0, 2, 1]);
    });

    it("round-trips every cleanup property through graph serialization", () => {
        const asset = new NodeAsset("cleanup-properties");
        const weld = new WeldVerticesBlock("Weld Vertices", asset);
        weld.overwrite = false;
        const removeUnused = new RemoveUnusedResourcesBlock("Remove Unused Resources", asset);
        removeUnused.keptPropertyTypes = [PropertyType.MATERIAL, PropertyType.TEXTURE];
        removeUnused.keepLeafNodes = true;
        removeUnused.keepAttributes = true;
        removeUnused.keepSolidTextures = true;
        removeUnused.keepExtras = true;
        const removeDegenerate = new RemoveDegenerateGeometryBlock("Remove Degenerate Geometry", asset);
        removeDegenerate.tolerance = 0.001;
        new FixFaceWindingBlock("Fix Face Winding", asset);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.serialize()).toEqual(serialized);
        expect(parsed.attachedBlocks.map((block) => block.getClassName())).toEqual([
            WeldVerticesBlock.ClassName,
            RemoveUnusedResourcesBlock.ClassName,
            RemoveDegenerateGeometryBlock.ClassName,
            FixFaceWindingBlock.ClassName,
        ]);
    });

    it("builds a valid GLB with usable geometry through all four cleanup operators", async () => {
        const source = await CreateDocumentWithUnusedResourcesAsync();
        const built = await BuildWithOperatorsAsync(source, (asset) => [
            new WeldVerticesBlock("Weld Vertices", asset),
            new RemoveUnusedResourcesBlock("Remove Unused Resources", asset),
            new RemoveDegenerateGeometryBlock("Remove Degenerate Geometry", asset),
            new FixFaceWindingBlock("Fix Face Winding", asset),
        ]);
        const primitive = GetOnlyPrimitive(built);

        expect(built.getRoot().listScenes()).toHaveLength(1);
        expect(primitive.getAttribute("POSITION")?.getCount()).toBe(4);
        expect(primitive.getIndices()?.getCount()).toBe(6);
    });

    it("keeps legacy Weld and Prune graphs loadable without changing their glTF connection type", () => {
        const serialized = {
            name: "legacy-cleanup",
            blocks: [
                { customType: WeldBlock.ClassName, id: 1, name: "Weld", overwrite: false },
                { customType: PruneBlock.ClassName, id: 2, name: "Prune", keepLeaves: true, keepAttributes: true },
            ],
            connections: [{ fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" }],
        };

        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks[0].outputs[0].type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(parsed.attachedBlocks[1].inputs[0].type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
    });

    it("fails clearly for an unsupported retired cleanup spelling", () => {
        expect(() =>
            NodeAsset.Parse({
                name: "retired-cleanup",
                blocks: [{ customType: "WeldVertices", id: 1, name: "Weld Vertices" }],
                connections: [],
            })
        ).toThrow('Cannot deserialize unknown block type "WeldVertices".');
    });
});
