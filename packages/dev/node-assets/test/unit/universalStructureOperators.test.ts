import { Document, type Material, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { FlattenHierarchyBlock } from "../../src/Blocks/flattenHierarchyBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { JoinMeshesBlock } from "../../src/Blocks/joinMeshesBlock";
import { MergeScenesBlock } from "../../src/Blocks/mergeScenesBlock";
import { SplitMeshesByMaterialBlock } from "../../src/Blocks/splitMeshesByMaterialBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const Io = new WebIO().registerExtensions(ALL_EXTENSIONS);

function AddTriangle(document: Document, name: string, material: Material, x = 0) {
    const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
    const position = document
        .createAccessor(`${name}-position`)
        .setType("VEC3")
        .setArray(new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0]))
        .setBuffer(buffer);
    return document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);
}

async function WriteDocumentAsync(document: Document): Promise<Uint8Array> {
    return await Io.writeBinary(document);
}

async function BuildSingleOperatorAsync(
    source: Uint8Array,
    createOperator: (asset: NodeAsset) => {
        readonly input: { readonly type: NodeAssetConnectionPointType };
        readonly output: { readonly type: NodeAssetConnectionPointType };
    }
): Promise<{ readonly document: Document; readonly operator: ReturnType<typeof createOperator>; readonly asset: NodeAsset }> {
    const asset = new NodeAsset("structure");
    const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
    importer.setUploadedSource(source, "fixture.glb");
    const operator = createOperator(asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);

    importer.output.connectTo((operator as { readonly input: ImportGLTFAggregateBlock["output"] }).input);
    (operator as { readonly output: ExportGLTFAggregateBlock["input"] }).output.connectTo(exporter.input);

    expect(operator.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
    expect(operator.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);

    const glb = await asset.buildAsync();
    expect(glb.byteLength).toBeGreaterThan(0);
    return { document: await Io.readBinary(glb), operator, asset };
}

describe("Universal structure operators", () => {
    it("flattens hierarchy and serializes cleanup through the Universal seam", async () => {
        const source = new Document();
        const material = source.createMaterial("material");
        const mesh = source.createMesh("mesh").addPrimitive(AddTriangle(source, "triangle", material));
        const child = source.createNode("mesh-node").setMesh(mesh);
        const emptyParent = source.createNode("empty-parent").setTranslation([3, 0, 0]).addChild(child);
        source.createScene("scene").addChild(emptyParent);

        const { document, operator, asset } = await BuildSingleOperatorAsync(await WriteDocumentAsync(source), (owner) => new FlattenHierarchyBlock("Flatten Hierarchy", owner));

        expect(
            document
                .getRoot()
                .listScenes()[0]
                .listChildren()
                .map((node) => node.getName())
        ).toEqual(["mesh-node"]);
        expect(
            document
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).not.toContain("empty-parent");

        operator.cleanup = false;
        expect(asset.serialize().blocks.find((block) => block.customType === FlattenHierarchyBlock.ClassName)).toMatchObject({ cleanup: false });
        const parsed = NodeAsset.Parse(asset.serialize());
        expect(parsed.attachedBlocks.find((block) => block instanceof FlattenHierarchyBlock)).toMatchObject({ cleanup: false });
    });

    it("joins meshes with the approved options and round-trips them", async () => {
        const source = new Document();
        const material = source.createMaterial("shared");
        const scene = source.createScene("scene");
        for (let index = 0; index < 2; index++) {
            const mesh = source.createMesh(`mesh-${index}`).addPrimitive(AddTriangle(source, `triangle-${index}`, material, index * 2));
            scene.addChild(source.createNode().setMesh(mesh));
        }

        const { document, operator, asset } = await BuildSingleOperatorAsync(await WriteDocumentAsync(source), (owner) => new JoinMeshesBlock("Join Meshes", owner));

        expect(document.getRoot().listMeshes()).toHaveLength(1);
        operator.keepMeshes = true;
        operator.keepNamed = true;
        operator.cleanup = false;
        expect(asset.serialize().blocks.find((block) => block.customType === JoinMeshesBlock.ClassName)).toMatchObject({
            keepMeshes: true,
            keepNamed: true,
            cleanup: false,
        });
        const parsed = NodeAsset.Parse(asset.serialize());
        expect(parsed.attachedBlocks.find((block) => block instanceof JoinMeshesBlock)).toMatchObject({
            keepMeshes: true,
            keepNamed: true,
            cleanup: false,
        });
    });

    it("splits each multi-material mesh into single-material meshes", async () => {
        const source = new Document();
        const red = source.createMaterial("red");
        const blue = source.createMaterial("blue");
        const mesh = source
            .createMesh("multi-material")
            .addPrimitive(AddTriangle(source, "red-triangle", red))
            .addPrimitive(AddTriangle(source, "blue-triangle", blue, 2));
        source.createScene("scene").addChild(source.createNode("mesh-node").setMesh(mesh).setTranslation([4, 0, 0]));

        const { document } = await BuildSingleOperatorAsync(await WriteDocumentAsync(source), (owner) => new SplitMeshesByMaterialBlock("Split Meshes by Material", owner));
        const meshes = document.getRoot().listMeshes();

        expect(meshes).toHaveLength(2);
        expect(meshes.every((candidate) => new Set(candidate.listPrimitives().map((primitive) => primitive.getMaterial())).size === 1)).toBe(true);
        expect(
            document
                .getRoot()
                .listNodes()
                .filter((node) => node.getMesh() !== null)
        ).toHaveLength(2);
        expect(document.getRoot().listScenes()[0].listChildren()[0].getTranslation()).toEqual([4, 0, 0]);
    });

    it("merges variadic Universal sources and restores input arity and wiring", async () => {
        const asset = new NodeAsset("assembly");
        const merge = new MergeScenesBlock("Merge Scenes", asset);
        const sourceNames = ["alpha", "beta", "gamma"];
        const imports = await Promise.all(
            sourceNames.map(async (name) => {
                const document = new Document();
                document.createScene(`${name}-scene`).addChild(document.createNode(`${name}-node`));
                const importer = new ImportGLTFAggregateBlock(`Import ${name}`, asset);
                importer.setUploadedSource(await WriteDocumentAsync(document), `${name}.glb`);
                return importer;
            })
        );
        const thirdInput = merge.addInput();
        imports[0].output.connectTo(merge.inputs[0]);
        imports[1].output.connectTo(merge.inputs[1]);
        imports[2].output.connectTo(thirdInput);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        merge.output.connectTo(exporter.input);

        expect(merge.inputs.every((input) => input.type === NodeAssetConnectionPointType.UNIVERSAL)).toBe(true);
        expect(merge.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);

        const serialized = asset.serialize();
        expect(serialized.blocks.find((block) => block.customType === MergeScenesBlock.ClassName)).toMatchObject({ inputCount: 3 });
        const parsed = NodeAsset.Parse(serialized);
        const parsedMerge = parsed.attachedBlocks.find((block): block is MergeScenesBlock => block instanceof MergeScenesBlock);
        expect(parsedMerge?.inputs).toHaveLength(3);
        expect(parsedMerge?.inputs.every((input) => input.isConnected)).toBe(true);

        const result = await parsed.buildAsync();
        const document = await Io.readBinary(result);
        expect(document.getRoot().listScenes()).toHaveLength(1);
        expect(
            document
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
                .sort()
        ).toEqual(["alpha-node", "beta-node", "gamma-node"]);
    });

    it("builds a valid structure chain after a Universal source fans out and reconverges", async () => {
        const source = new Document();
        const material = source.createMaterial("shared");
        const scene = source.createScene("source-scene");
        for (let index = 0; index < 2; index++) {
            const mesh = source.createMesh().addPrimitive(AddTriangle(source, `triangle-${index}`, material, index * 2));
            scene.addChild(source.createNode().setMesh(mesh));
        }

        const asset = new NodeAsset("fan-out-structure-chain");
        const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
        importer.setUploadedSource(await WriteDocumentAsync(source), "source.glb");
        const flatten = new FlattenHierarchyBlock("Flatten Hierarchy", asset);
        const join = new JoinMeshesBlock("Join Meshes", asset);
        const split = new SplitMeshesByMaterialBlock("Split Meshes by Material", asset);
        const merge = new MergeScenesBlock("Merge Scenes", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);

        importer.output.connectTo(flatten.input);
        importer.output.connectTo(merge.inputs[1]);
        flatten.output.connectTo(join.input);
        join.output.connectTo(split.input);
        split.output.connectTo(merge.inputs[0]);
        merge.output.connectTo(exporter.input);

        const result = await asset.buildAsync();
        const document = await Io.readBinary(result);
        expect(result.subarray(0, 4)).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        expect(document.getRoot().listScenes()).toHaveLength(1);
        expect(document.getRoot().listMeshes()).toHaveLength(3);
    });
});
