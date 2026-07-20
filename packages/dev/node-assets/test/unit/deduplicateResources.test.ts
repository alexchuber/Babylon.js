import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { DeduplicateMaterialsBlock } from "../../src/Blocks/deduplicateMaterialsBlock";
import { DeduplicateDataBlock } from "../../src/Blocks/deduplicateDataBlock";
import { DeduplicateResourcesBlock } from "../../src/Blocks/deduplicateResourcesBlock";
import { DeduplicateTexturesBlock } from "../../src/Blocks/deduplicateTexturesBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { ReuseIdenticalMeshesBlock } from "../../src/Blocks/reuseIdenticalMeshesBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const IO = new WebIO().registerExtensions(ALL_EXTENSIONS);
const TinyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function CreateDuplicateMaterialsGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const first = document.createMaterial("first").setBaseColorFactor([1, 0, 0, 1]);
    const second = document.createMaterial("second").setBaseColorFactor([1, 0, 0, 1]);
    const firstMesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute("POSITION", positions).setMaterial(first));
    const secondMesh = document.createMesh().addPrimitive(document.createPrimitive().setAttribute("POSITION", positions).setMaterial(second));
    document.createScene().addChild(document.createNode().setMesh(firstMesh)).addChild(document.createNode().setMesh(secondMesh));
    return await IO.writeBinary(document);
}

async function CreateDuplicateTexturesGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    document.createBuffer();
    const first = document.createTexture("first").setImage(TinyPng).setMimeType("image/png");
    const second = document.createTexture("second").setImage(TinyPng).setMimeType("image/png");
    document.createMaterial().setBaseColorTexture(first).setEmissiveTexture(second);
    return await IO.writeBinary(document);
}

async function CreateDuplicateMeshesGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const material = document.createMaterial();
    const createMesh = (name: string) => document.createMesh(name).addPrimitive(document.createPrimitive().setAttribute("POSITION", positions).setMaterial(material));
    document
        .createScene()
        .addChild(document.createNode().setMesh(createMesh("first")))
        .addChild(document.createNode().setMesh(createMesh("second")));
    return await IO.writeBinary(document);
}

async function CreateDuplicateDataGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const createPositions = () =>
        document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);
    const firstMesh = document.createMesh().addPrimitive(
        document
            .createPrimitive()
            .setAttribute("POSITION", createPositions())
            .setMaterial(document.createMaterial().setBaseColorFactor([1, 0, 0, 1]))
    );
    const secondMesh = document.createMesh().addPrimitive(
        document
            .createPrimitive()
            .setAttribute("POSITION", createPositions())
            .setMaterial(document.createMaterial().setBaseColorFactor([0, 1, 0, 1]))
    );
    const joint = document.createNode("joint");
    const firstSkin = document.createSkin("first").addJoint(joint);
    const secondSkin = document.createSkin("second").addJoint(joint);
    document
        .createScene()
        .addChild(joint)
        .addChild(document.createNode().setMesh(firstMesh).setSkin(firstSkin))
        .addChild(document.createNode().setMesh(secondMesh).setSkin(secondSkin));
    return await IO.writeBinary(document);
}

async function CreateNamedDuplicateAccessorsGlbAsync(firstName: string, secondName: string): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const createMesh = (name: string) => {
        const positions = document
            .createAccessor(name)
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);
        return document.createMesh().addPrimitive(document.createPrimitive().setAttribute("POSITION", positions));
    };
    document
        .createScene()
        .addChild(document.createNode().setMesh(createMesh(firstName)))
        .addChild(document.createNode().setMesh(createMesh(secondName)));
    return await IO.writeBinary(document);
}

async function BuildNamedDuplicateAccessorsAsync(firstName: string, secondName: string, keepUniqueNames: boolean): Promise<Document> {
    const asset = new NodeAsset("named-accessors");
    const input = new ImportGLTFAggregateBlock("Import glTF", asset);
    input.data = await CreateNamedDuplicateAccessorsGlbAsync(firstName, secondName);
    input.source = "named-accessors.glb";
    const deduplicate = new DeduplicateDataBlock("Deduplicate Data", asset);
    deduplicate.keepUniqueNames = keepUniqueNames;
    const output = new ExportGLTFAggregateBlock("Export glTF", asset);
    input.output.connectTo(deduplicate.input);
    deduplicate.output.connectTo(output.input);
    return await IO.readBinary(await asset.buildAsync());
}

async function CreateDuplicateResourcesGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const createPositions = () =>
        document
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
            .setBuffer(buffer);
    const sharedPositions = createPositions();
    const duplicateMaterialA = document.createMaterial("material-a").setBaseColorFactor([1, 0, 0, 1]);
    const duplicateMaterialB = document.createMaterial("material-b").setBaseColorFactor([1, 0, 0, 1]);
    const duplicateTextureA = document.createTexture("texture-a").setImage(TinyPng).setMimeType("image/png");
    const duplicateTextureB = document.createTexture("texture-b").setImage(TinyPng).setMimeType("image/png");
    document.createMaterial("textured").setBaseColorTexture(duplicateTextureA).setEmissiveTexture(duplicateTextureB);
    const uniqueMaterialA = document.createMaterial("unique-a").setBaseColorFactor([0, 1, 0, 1]);
    const uniqueMaterialB = document.createMaterial("unique-b").setBaseColorFactor([0, 0, 1, 1]);
    const meshA = document.createMesh("mesh-a").addPrimitive(document.createPrimitive().setAttribute("POSITION", sharedPositions).setMaterial(duplicateMaterialA));
    const meshB = document.createMesh("mesh-b").addPrimitive(document.createPrimitive().setAttribute("POSITION", sharedPositions).setMaterial(duplicateMaterialB));
    const dataMeshA = document.createMesh().addPrimitive(document.createPrimitive().setAttribute("POSITION", createPositions()).setMaterial(uniqueMaterialA));
    const dataMeshB = document.createMesh().addPrimitive(document.createPrimitive().setAttribute("POSITION", createPositions()).setMaterial(uniqueMaterialB));
    const joint = document.createNode("joint");
    const skinA = document.createSkin("skin-a").addJoint(joint);
    const skinB = document.createSkin("skin-b").addJoint(joint);
    document
        .createScene()
        .addChild(joint)
        .addChild(document.createNode().setMesh(meshA))
        .addChild(document.createNode().setMesh(meshB))
        .addChild(document.createNode().setMesh(dataMeshA).setSkin(skinA))
        .addChild(document.createNode().setMesh(dataMeshB).setSkin(skinB));
    return await IO.writeBinary(document);
}

function GetResourceCounts(document: Document) {
    const root = document.getRoot();
    return {
        materials: root.listMaterials().length,
        textures: root.listTextures().length,
        meshes: root.listMeshes().length,
        accessors: root.listAccessors().length,
        skins: root.listSkins().length,
    };
}

describe("Deduplicate Resources", () => {
    it("deduplicates equivalent materials in a Universal build", async () => {
        const asset = new NodeAsset("deduplicate-materials");
        const input = new ImportGLTFAggregateBlock("Import glTF", asset);
        input.data = await CreateDuplicateMaterialsGlbAsync();
        input.source = "materials.glb";
        const deduplicate = new DeduplicateMaterialsBlock("Deduplicate Materials", asset);
        const output = new ExportGLTFAggregateBlock("Export glTF", asset);
        input.output.connectTo(deduplicate.input);
        deduplicate.output.connectTo(output.input);

        const result = await asset.buildAsync();
        const document = await IO.readBinary(result);

        expect(deduplicate.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(deduplicate.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(document.getRoot().listMaterials()).toHaveLength(1);
    });

    it("deduplicates equivalent textures in a Universal build", async () => {
        const asset = new NodeAsset("deduplicate-textures");
        const input = new ImportGLTFAggregateBlock("Import glTF", asset);
        input.data = await CreateDuplicateTexturesGlbAsync();
        input.source = "textures.glb";
        const deduplicate = new DeduplicateTexturesBlock("Deduplicate Textures", asset);
        const output = new ExportGLTFAggregateBlock("Export glTF", asset);
        input.output.connectTo(deduplicate.input);
        deduplicate.output.connectTo(output.input);

        const result = await asset.buildAsync();
        const document = await IO.readBinary(result);

        expect(deduplicate.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(deduplicate.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(document.getRoot().listTextures()).toHaveLength(1);
    });

    it("reuses identical mesh resources without creating runtime instances", async () => {
        const asset = new NodeAsset("reuse-identical-meshes");
        const input = new ImportGLTFAggregateBlock("Import glTF", asset);
        input.data = await CreateDuplicateMeshesGlbAsync();
        input.source = "meshes.glb";
        const reuse = new ReuseIdenticalMeshesBlock("Reuse Identical Meshes", asset);
        const output = new ExportGLTFAggregateBlock("Export glTF", asset);
        input.output.connectTo(reuse.input);
        reuse.output.connectTo(output.input);

        const result = await asset.buildAsync();
        const document = await IO.readBinary(result);
        const nodes = document.getRoot().listNodes();

        expect(reuse.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(reuse.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(document.getRoot().listMeshes()).toHaveLength(1);
        expect(nodes).toHaveLength(2);
        expect(nodes[0].getMesh()).toBe(nodes[1].getMesh());
    });

    it("deduplicates accessors and skins as shared data in a Universal build", async () => {
        const asset = new NodeAsset("deduplicate-data");
        const input = new ImportGLTFAggregateBlock("Import glTF", asset);
        input.data = await CreateDuplicateDataGlbAsync();
        input.source = "data.glb";
        const deduplicate = new DeduplicateDataBlock("Deduplicate Data", asset);
        const output = new ExportGLTFAggregateBlock("Export glTF", asset);
        input.output.connectTo(deduplicate.input);
        deduplicate.output.connectTo(output.input);

        const result = await asset.buildAsync();
        const document = await IO.readBinary(result);

        expect(deduplicate.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(deduplicate.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(document.getRoot().listAccessors()).toHaveLength(1);
        expect(document.getRoot().listSkins()).toHaveLength(1);
    });

    it("preserves byte-identical accessors with distinct names when keep unique names is enabled", async () => {
        const document = await BuildNamedDuplicateAccessorsAsync("first", "second", true);
        expect(
            document
                .getRoot()
                .listAccessors()
                .map((accessor) => accessor.getName())
        ).toEqual(["first", "second"]);
    });

    it("deduplicates byte-identical accessors with distinct names when keep unique names is disabled", async () => {
        const document = await BuildNamedDuplicateAccessorsAsync("first", "second", false);
        expect(
            document
                .getRoot()
                .listAccessors()
                .map((accessor) => accessor.getName())
        ).toEqual(["first"]);
    });

    it.each([
        { caseName: "same-name", firstName: "shared", secondName: "shared" },
        { caseName: "unnamed", firstName: "", secondName: "" },
    ])("deduplicates $caseName accessors when keep unique names is enabled", async ({ firstName, secondName }) => {
        const document = await BuildNamedDuplicateAccessorsAsync(firstName, secondName, true);
        expect(document.getRoot().listAccessors()).toHaveLength(1);
    });

    it.each([
        {
            name: "Deduplicate Materials",
            createFixture: CreateDuplicateMaterialsGlbAsync,
            createBlock: (asset: NodeAsset) => new DeduplicateMaterialsBlock("Deduplicate Materials", asset),
            countNamedResources: (document: Document) => document.getRoot().listMaterials().length,
        },
        {
            name: "Deduplicate Textures",
            createFixture: CreateDuplicateTexturesGlbAsync,
            createBlock: (asset: NodeAsset) => new DeduplicateTexturesBlock("Deduplicate Textures", asset),
            countNamedResources: (document: Document) => document.getRoot().listTextures().length,
        },
        {
            name: "Reuse Identical Meshes",
            createFixture: CreateDuplicateMeshesGlbAsync,
            createBlock: (asset: NodeAsset) => new ReuseIdenticalMeshesBlock("Reuse Identical Meshes", asset),
            countNamedResources: (document: Document) => document.getRoot().listMeshes().length,
        },
        {
            name: "Deduplicate Data",
            createFixture: CreateDuplicateDataGlbAsync,
            createBlock: (asset: NodeAsset) => new DeduplicateDataBlock("Deduplicate Data", asset),
            countNamedResources: (document: Document) => document.getRoot().listSkins().length,
        },
    ])("$name preserves uniquely named resources and its setting across serialization", async ({ createFixture, createBlock, countNamedResources }) => {
        const asset = new NodeAsset("keep-unique-names");
        const input = new ImportGLTFAggregateBlock("Import glTF", asset);
        input.data = await createFixture();
        input.source = "named-resources.glb";
        const deduplicate = createBlock(asset);
        deduplicate.keepUniqueNames = true;
        const output = new ExportGLTFAggregateBlock("Export glTF", asset);
        input.output.connectTo(deduplicate.input);
        deduplicate.output.connectTo(output.input);
        const serialized = asset.serialize();
        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));

        const result = await parsed.buildAsync();
        const document = await IO.readBinary(result);

        expect(parsed.serialize()).toEqual(serialized);
        expect(countNamedResources(document)).toBe(2);
    });

    it("composes the exact primitive order and matches the expanded Universal chain", async () => {
        const source = await CreateDuplicateResourcesGlbAsync();

        const aggregateAsset = new NodeAsset("aggregate");
        const aggregateInput = new ImportGLTFAggregateBlock("Import glTF", aggregateAsset);
        aggregateInput.data = source;
        aggregateInput.source = "resources.glb";
        const aggregate = new DeduplicateResourcesBlock("Deduplicate Resources", aggregateAsset);
        const aggregateOutput = new ExportGLTFAggregateBlock("Export glTF", aggregateAsset);
        aggregateInput.output.connectTo(aggregate.input);
        aggregate.output.connectTo(aggregateOutput.input);

        const serialized = aggregateAsset.serialize();
        const serializedAggregate = serialized.blocks.find((block) => block.customType === DeduplicateResourcesBlock.ClassName);
        expect(aggregate.subgraph.attachedBlocks.map((block) => block.name)).toEqual([
            "Deduplicate Materials",
            "Deduplicate Textures",
            "Reuse Identical Meshes",
            "Deduplicate Data",
        ]);
        expect(aggregate.subgraph.attachedBlocks.map((block) => block.getClassName())).toEqual([
            DeduplicateMaterialsBlock.ClassName,
            DeduplicateTexturesBlock.ClassName,
            ReuseIdenticalMeshesBlock.ClassName,
            DeduplicateDataBlock.ClassName,
        ]);
        expect(aggregate.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(aggregate.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(serializedAggregate?.subgraph).toMatchObject({
            blocks: [
                { customType: DeduplicateMaterialsBlock.ClassName },
                { customType: DeduplicateTexturesBlock.ClassName },
                { customType: ReuseIdenticalMeshesBlock.ClassName },
                { customType: DeduplicateDataBlock.ClassName },
            ],
        });

        const aggregateResult = await NodeAsset.Parse(JSON.parse(JSON.stringify(serialized))).buildAsync();

        const expandedAsset = new NodeAsset("expanded");
        const expandedInput = new ImportGLTFAggregateBlock("Import glTF", expandedAsset);
        expandedInput.data = source;
        expandedInput.source = "resources.glb";
        const materials = new DeduplicateMaterialsBlock("Deduplicate Materials", expandedAsset);
        const textures = new DeduplicateTexturesBlock("Deduplicate Textures", expandedAsset);
        const meshes = new ReuseIdenticalMeshesBlock("Reuse Identical Meshes", expandedAsset);
        const data = new DeduplicateDataBlock("Deduplicate Data", expandedAsset);
        const expandedOutput = new ExportGLTFAggregateBlock("Export glTF", expandedAsset);
        expandedInput.output.connectTo(materials.input);
        materials.output.connectTo(textures.input);
        textures.output.connectTo(meshes.input);
        meshes.output.connectTo(data.input);
        data.output.connectTo(expandedOutput.input);
        const expandedResult = await expandedAsset.buildAsync();

        const aggregateCounts = GetResourceCounts(await IO.readBinary(aggregateResult));
        const expandedCounts = GetResourceCounts(await IO.readBinary(expandedResult));
        expect(aggregateCounts).toEqual({ materials: 4, textures: 1, meshes: 3, accessors: 1, skins: 1 });
        expect(aggregateCounts).toEqual(expandedCounts);
    });

    it("round-trips each forwarded aggregate property through its owned primitive", () => {
        const asset = new NodeAsset("aggregate-options");
        const aggregate = new DeduplicateResourcesBlock("Deduplicate Resources", asset);
        aggregate.deduplicateMaterialsBlock.keepUniqueNames = true;
        aggregate.deduplicateTexturesBlock.keepUniqueNames = true;
        aggregate.reuseIdenticalMeshesBlock.keepUniqueNames = true;
        aggregate.deduplicateDataBlock.keepUniqueNames = true;
        const serialized = asset.serialize();

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedAggregate = parsed.attachedBlocks[0] as DeduplicateResourcesBlock;

        expect(parsedAggregate).toBeInstanceOf(DeduplicateResourcesBlock);
        expect(parsedAggregate.deduplicateMaterialsBlock.keepUniqueNames).toBe(true);
        expect(parsedAggregate.deduplicateTexturesBlock.keepUniqueNames).toBe(true);
        expect(parsedAggregate.reuseIdenticalMeshesBlock.keepUniqueNames).toBe(true);
        expect(parsedAggregate.deduplicateDataBlock.keepUniqueNames).toBe(true);
        expect(parsed.serialize()).toEqual(serialized);
    });
});
