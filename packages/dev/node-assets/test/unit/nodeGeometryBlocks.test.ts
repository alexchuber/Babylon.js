import { describe, expect, it, vi } from "vitest";
import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { EvaluateNodeGeometryBlock } from "../../src/Blocks/evaluateNodeGeometryBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportNodeGeometryBlock } from "../../src/Blocks/importNodeGeometryBlock";
import { ImportNodeGeometryAggregateBlock } from "../../src/Blocks/importNodeGeometryAggregateBlock";
import { NodeGeometryToUniversalBlock } from "../../src/Blocks/nodeGeometryToUniversalBlock";
import { NodeGeometryInputBlock } from "../../src/Blocks/nodeGeometryInputBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { GLTFOutputBlock } from "../../src/Blocks/gltfOutputBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { IsBabylonAsset, type BabylonAsset } from "../../src/representations/babylonAsset";
import { NodeGeometryAsset } from "../../src/representations/nodeGeometryAsset";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { GeometryOutputBlock } from "core/Meshes/Node/Blocks/geometryOutputBlock";
import { BoxBlock } from "core/Meshes/Node/Blocks/Sources/boxBlock";

// Re-export the real draco3dgltf to avoid the global vitest stub.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

function CreateMinimalNodeGeometry(): NodeGeometry {
    const ng = new NodeGeometry("testNG");
    const boxBlock = new BoxBlock("box");
    const outputBlock = new GeometryOutputBlock("output");
    boxBlock.geometry.connectTo(outputBlock.geometry);
    ng.outputBlock = outputBlock;
    ng.attachedBlocks.push(boxBlock, outputBlock);
    return ng;
}

function CreateTestNodeGeometryAsset(): NodeGeometryAsset {
    const ng = CreateMinimalNodeGeometry();
    return new NodeGeometryAsset(ng, {
        identity: "test-ng",
        revision: 0,
        manifest: { format: "nodeGeometry" },
    });
}

function CreateSerializedNodeGeometry(): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(CreateMinimalNodeGeometry().serialize()));
}

describe("Node Geometry to Universal funnel", () => {
    it("builds externally meaningful geometry through the primitive path", async () => {
        const asset = new NodeAsset("node-geometry-funnel");
        const read = new NodeGeometryInputBlock("Node Geometry", asset);
        await read.setUploadedSourceAsync(CreateSerializedNodeGeometry(), "box.json");
        const toUniversal = new NodeGeometryToUniversalBlock("Node Geometry → Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", asset);
        const write = new GLTFOutputBlock("glTF", asset);

        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(toGltf.input);
        toGltf.output.connectTo(write.input);

        expect(read.inputs).toHaveLength(0);
        expect(read.output.type).toBe(NodeAssetConnectionPointType.NODE_GEOMETRY);
        expect(toUniversal.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);

        const result = await asset.buildAsync();
        const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);
        const primitives = document
            .getRoot()
            .listMeshes()
            .flatMap((mesh) => mesh.listPrimitives());
        const position = primitives[0]?.getAttribute("POSITION");
        const positions = Array.from(position?.getArray() ?? []);
        const xValues = positions.filter((_, index) => index % 3 === 0);
        const yValues = positions.filter((_, index) => index % 3 === 1);
        const zValues = positions.filter((_, index) => index % 3 === 2);

        expect(result.byteLength).toBeGreaterThan(0);
        expect(primitives).toHaveLength(1);
        expect(position?.getCount()).toBe(24);
        expect([Math.min(...xValues), Math.min(...yValues), Math.min(...zValues)]).toEqual([-0.5, -0.5, -0.5]);
        expect([Math.max(...xValues), Math.max(...yValues), Math.max(...zValues)]).toEqual([0.5, 0.5, 0.5]);
    });

    it("round-trips the aggregate and matches the expanded primitive graph", async () => {
        const source = CreateSerializedNodeGeometry();
        const aggregateAsset = new NodeAsset("aggregate-node-geometry");
        const importAggregate = new ImportNodeGeometryAggregateBlock("Import Node Geometry", aggregateAsset);
        await importAggregate.setUploadedSourceAsync(source, "box.json");
        const exportAggregate = new ExportGLTFAggregateBlock("Export glTF", aggregateAsset);
        importAggregate.output.connectTo(exportAggregate.input);

        const serialized = aggregateAsset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportNodeGeometryAggregateBlock.ClassName,
            subgraph: {
                blocks: [{ customType: NodeGeometryInputBlock.ClassName }, { customType: NodeGeometryToUniversalBlock.ClassName }],
            },
        });
        const aggregateResult = await NodeAsset.Parse(JSON.parse(JSON.stringify(serialized))).buildAsync();

        const primitiveAsset = new NodeAsset("primitive-node-geometry");
        const read = new NodeGeometryInputBlock("Node Geometry", primitiveAsset);
        await read.setUploadedSourceAsync(source, "box.json");
        const toUniversal = new NodeGeometryToUniversalBlock("Node Geometry → Universal", primitiveAsset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", primitiveAsset);
        const write = new GLTFOutputBlock("glTF", primitiveAsset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(toGltf.input);
        toGltf.output.connectTo(write.input);
        const primitiveResult = await primitiveAsset.buildAsync();

        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const getGeometryFacts = async (bytes: Uint8Array) => {
            const document = await io.readBinary(bytes);
            const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
            return {
                meshCount: document.getRoot().listMeshes().length,
                positionCount: primitive?.getAttribute("POSITION")?.getCount(),
                indexCount: primitive?.getIndices()?.getCount(),
            };
        };
        expect(await getGeometryFacts(aggregateResult)).toEqual(await getGeometryFacts(primitiveResult));
        expect(await getGeometryFacts(aggregateResult)).toEqual({
            meshCount: 1,
            positionCount: 24,
            indexCount: 36,
        });
    });

    it("keeps and persists the last successful snippet or upload on the aggregate and Read primitive", async () => {
        const uploaded = CreateSerializedNodeGeometry();
        const asset = new NodeAsset("node-geometry-source");
        const importer = new ImportNodeGeometryAggregateBlock("Import Node Geometry", asset);

        await importer.setUploadedSourceAsync(uploaded, "uploaded.json");
        await expect(
            importer.setSnippetIdAsync("missing#1", async () => {
                throw new Error("snippet missing");
            })
        ).rejects.toThrow("snippet missing");
        expect(importer.source).toBe("uploaded.json");
        expect(importer.sourceKind).toBe("upload");
        await expect(importer.setSnippetIdAsync("invalid#1", async () => new TextEncoder().encode("{}"))).rejects.toThrow("Node Geometry source must contain a serialized graph");
        expect(importer.source).toBe("uploaded.json");
        expect(importer.sourceKind).toBe("upload");

        await importer.setSnippetIdAsync("#BOX#1", async () => uploaded);
        expect(importer.source).toBe("BOX#1");
        expect(importer.sourceKind).toBe("snippet");
        expect(importer.inputBlock.source).toBe("BOX#1");

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const parsedImporter = parsed.attachedBlocks[0] as ImportNodeGeometryAggregateBlock;
        expect(parsedImporter.source).toBe("BOX#1");
        expect(parsedImporter.sourceKind).toBe("snippet");
        expect(parsedImporter.data).toEqual(uploaded);
    });

    it("does not let an older snippet request replace a newer successful upload", async () => {
        const source = CreateSerializedNodeGeometry();
        const asset = new NodeAsset("node-geometry-source-race");
        const importer = new ImportNodeGeometryAggregateBlock("Import Node Geometry", asset);
        let resolveSnippet: ((data: Uint8Array) => void) | undefined;

        const pendingSnippet = importer.setSnippetIdAsync(
            "BOX#1",
            async () =>
                await new Promise<Uint8Array>((resolve) => {
                    resolveSnippet = resolve;
                })
        );
        await importer.setUploadedSourceAsync(source, "uploaded.json");
        resolveSnippet?.(source);
        await pendingSnippet;

        expect(importer.source).toBe("uploaded.json");
        expect(importer.sourceKind).toBe("upload");
        expect(importer.data).toEqual(source);
    });

    it("keeps a Node Geometry source cleared when an earlier snippet request succeeds later", async () => {
        const source = CreateSerializedNodeGeometry();
        const asset = new NodeAsset("cleared-node-geometry-source");
        const read = new NodeGeometryInputBlock("Node Geometry", asset);
        let resolveSnippet: ((data: Uint8Array) => void) | undefined;
        const pendingSnippet = read.setSnippetIdAsync(
            "BOX#1",
            async () =>
                await new Promise<Uint8Array>((resolve) => {
                    resolveSnippet = resolve;
                })
        );

        read.clearSource();
        resolveSnippet?.(source);
        await pendingSnippet;

        expect(read.data).toBeNull();
        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
    });

    it("rejects unrelated-domain wiring from the distinct Node Geometry payload kind", () => {
        expect(() =>
            NodeAsset.Parse({
                name: "invalid-node-geometry-wiring",
                blocks: [
                    { customType: NodeGeometryInputBlock.ClassName, id: 1, name: "Node Geometry", data: null, source: null },
                    { customType: UniversalToGLTFBlock.ClassName, id: 2, name: "Universal → glTF" },
                    { customType: GLTFOutputBlock.ClassName, id: 3, name: "glTF" },
                ],
                connections: [
                    { fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" },
                    { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" },
                ],
            })
        ).toThrow(/incompatible connection point types/);
    });
});

describe("ImportNodeGeometryBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new ImportNodeGeometryBlock("import", asset);

        expect(block.url.type).toBe(NodeAssetConnectionPointType.STRING);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.NODE_GEOMETRY);
    });

    it("throws when no URL or snippet ID is provided", async () => {
        const asset = new NodeAsset("test");
        const block = new ImportNodeGeometryBlock("import", asset);
        block.url.value = "";

        await expect(block._buildBlockAsync()).rejects.toThrow("no URL or snippet ID");
    });
});

describe("EvaluateNodeGeometryBlock", () => {
    it("registers input and output connection points with correct types", () => {
        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        expect(block.input.type).toBe(NodeAssetConnectionPointType.NODE_GEOMETRY);
        expect(block.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SCENE);
    });

    it("evaluates a NodeGeometryAsset and produces a BabylonAsset", async () => {
        const ngAsset = CreateTestNodeGeometryAsset();

        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        block.input.value = ngAsset;

        await block._buildBlockAsync();

        const result = block.output.value;
        expect(IsBabylonAsset(result)).toBe(true);

        const babylonAsset = result as BabylonAsset;
        expect(babylonAsset.scene).toBeDefined();
        expect(babylonAsset.engine).toBeDefined();
        expect(babylonAsset.identity).toBe("test-ng");

        // The scene should contain the mesh produced by the geometry evaluation.
        expect(babylonAsset.scene.meshes.length).toBeGreaterThan(0);

        babylonAsset.dispose();
        ngAsset.dispose();
    });

    it("does not mutate the input NodeGeometryAsset", async () => {
        const ngAsset = CreateTestNodeGeometryAsset();
        const originalBlockCount = ngAsset.nodeGeometry.attachedBlocks.length;

        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);
        block.input.value = ngAsset;

        await block._buildBlockAsync();

        // The original asset should still have the same number of blocks.
        expect(ngAsset.nodeGeometry.attachedBlocks.length).toBe(originalBlockCount);

        (block.output.value as BabylonAsset).dispose();
        ngAsset.dispose();
    });

    it("throws when no input is connected", async () => {
        const asset = new NodeAsset("test");
        const block = new EvaluateNodeGeometryBlock("eval", asset);

        await expect(block._buildBlockAsync()).rejects.toThrow("no input Node Geometry");
    });
});
