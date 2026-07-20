import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { GLTFToUniversalBlock } from "../../src/Blocks/gltfToUniversalBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { ReadGLTFBlock } from "../../src/Blocks/readGLTFBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { WriteGLTFBlock } from "../../src/Blocks/writeGLTFBlock";
import { CustomAggregateBlock } from "../../src/blockFoundation/customAggregateBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    document.createScene("fixture-scene").addChild(document.createNode("fixture-node"));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

describe("Universal glTF funnel", () => {
    it("rejects a serialized glTF-to-Universal connection that skips the explicit transcoder", () => {
        expect(() =>
            NodeAsset.Parse({
                name: "invalid-funnel",
                blocks: [
                    { customType: ReadGLTFBlock.ClassName, id: 1, name: "Read glTF", data: null, source: null },
                    { customType: UniversalToGLTFBlock.ClassName, id: 2, name: "Universal to glTF" },
                    { customType: WriteGLTFBlock.ClassName, id: 3, name: "Write glTF" },
                ],
                connections: [
                    { fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" },
                    { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" },
                ],
            })
        ).toThrow(/incompatible connection point types/);
    });

    it("builds a valid GLB through the explicit glTF and Universal primitive path", async () => {
        const asset = new NodeAsset("explicit-funnel");
        const read = new ReadGLTFBlock("Read glTF", asset);
        read.data = await CreateFixtureGlbAsync();
        read.source = "fixture.glb";
        const toUniversal = new GLTFToUniversalBlock("glTF to Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal to glTF", asset);
        const write = new WriteGLTFBlock("Write glTF", asset);

        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(toGltf.input);
        toGltf.output.connectTo(write.input);

        expect(read.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(toUniversal.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(toGltf.input.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(write.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);

        const result = await asset.buildAsync();
        const built = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);

        expect(result.byteLength).toBeGreaterThan(0);
        expect(
            built
                .getRoot()
                .listScenes()
                .map((scene) => scene.getName())
        ).toEqual(["fixture-scene"]);
        expect(
            built
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).toEqual(["fixture-node"]);
    });

    it("round-trips aggregate subgraphs and builds the same asset facts as the primitive path", async () => {
        const source = await CreateFixtureGlbAsync();

        const aggregateAsset = new NodeAsset("aggregate-funnel");
        const importAggregate = new ImportGLTFAggregateBlock("Import glTF", aggregateAsset);
        importAggregate.data = source;
        importAggregate.source = "fixture.glb";
        const exportAggregate = new ExportGLTFAggregateBlock("Export glTF", aggregateAsset);
        exportAggregate.fileName = "aggregate-result";
        importAggregate.output.connectTo(exportAggregate.input);

        const serialized = aggregateAsset.serialize();
        const serializedImport = serialized.blocks.find((block) => block.customType === ImportGLTFAggregateBlock.ClassName);
        const serializedExport = serialized.blocks.find((block) => block.customType === ExportGLTFAggregateBlock.ClassName);
        expect(serializedImport?.aggregateVersion).toBe(1);
        expect(serializedImport?.subgraph).toMatchObject({
            blocks: [{ customType: ReadGLTFBlock.ClassName }, { customType: GLTFToUniversalBlock.ClassName }],
        });
        expect(serializedExport?.aggregateVersion).toBe(1);
        expect(serializedExport?.subgraph).toMatchObject({
            blocks: [{ customType: UniversalToGLTFBlock.ClassName }, { customType: WriteGLTFBlock.ClassName, fileName: "aggregate-result" }],
        });

        const aggregateResult = await NodeAsset.Parse(JSON.parse(JSON.stringify(serialized))).buildAsync();

        const primitiveAsset = new NodeAsset("primitive-funnel");
        const read = new ReadGLTFBlock("Read glTF", primitiveAsset);
        read.data = source;
        read.source = "fixture.glb";
        const toUniversal = new GLTFToUniversalBlock("glTF to Universal", primitiveAsset);
        const toGltf = new UniversalToGLTFBlock("Universal to glTF", primitiveAsset);
        const write = new WriteGLTFBlock("Write glTF", primitiveAsset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(toGltf.input);
        toGltf.output.connectTo(write.input);
        const primitiveResult = await primitiveAsset.buildAsync();

        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const aggregateDocument = await io.readBinary(aggregateResult);
        const primitiveDocument = await io.readBinary(primitiveResult);
        const assetFacts = (document: Document) => ({
            scenes: document
                .getRoot()
                .listScenes()
                .map((scene) => scene.getName()),
            nodes: document
                .getRoot()
                .listNodes()
                .map((node) => node.getName()),
        });
        expect(assetFacts(aggregateDocument)).toEqual(assetFacts(primitiveDocument));
    });

    it("detaches an aggregate to a custom aggregate whose owned subgraph survives save/load and build", async () => {
        const asset = new NodeAsset("custom-export");
        const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
        importer.data = await CreateFixtureGlbAsync();
        importer.source = "fixture.glb";
        const builtInExport = new ExportGLTFAggregateBlock("Export glTF", asset);
        const customExport = CustomAggregateBlock.FromAggregate(builtInExport, "Customized Export", asset);
        asset.removeBlock(builtInExport);
        importer.output.connectTo(customExport.inputs[0]);

        const serialized = asset.serialize();
        expect(serialized.blocks.find((block) => block.customType === CustomAggregateBlock.ClassName)).toMatchObject({
            aggregateVersion: 1,
            subgraph: {
                blocks: [{ customType: UniversalToGLTFBlock.ClassName }, { customType: WriteGLTFBlock.ClassName }],
            },
        });

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const result = await parsed.buildAsync();
        const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(result);

        expect(parsed.serialize()).toEqual(serialized);
        expect(
            document
                .getRoot()
                .listNodes()
                .map((node) => node.getName())
        ).toEqual(["fixture-node"]);
    });

    it("keeps the last successful URL or upload active and persists the selected glTF source", async () => {
        const uploaded = await CreateFixtureGlbAsync();
        const remoteDocument = new Document();
        remoteDocument.createScene("remote-scene");
        const remote = await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(remoteDocument);
        const asset = new NodeAsset("source-choice");
        const importer = new ImportGLTFAggregateBlock("Import glTF", asset);

        importer.setUploadedSource(uploaded, "uploaded.glb");
        await expect(
            importer.setUrlAsync("https://example.invalid/missing.glb", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/404 Not Found/);
        expect(importer.source).toBe("uploaded.glb");
        expect(importer.sourceKind).toBe("upload");

        await importer.setUrlAsync("https://example.com/remote.glb", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength),
        }));
        expect(importer.source).toBe("https://example.com/remote.glb");
        expect(importer.sourceKind).toBe("url");

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFAggregateBlock;
        expect(parsedImporter.source).toBe("https://example.com/remote.glb");
        expect(parsedImporter.sourceKind).toBe("url");
        expect(parsedImporter.data).toEqual(remote);
    });

    it("does not let an older URL request replace a newer successful upload", async () => {
        const uploaded = await CreateFixtureGlbAsync();
        const remoteDocument = new Document();
        remoteDocument.createScene("remote-scene");
        const remote = await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(remoteDocument);
        const asset = new NodeAsset("source-race");
        const importer = new ImportGLTFAggregateBlock("Import glTF", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = importer.setUrlAsync(
            "https://example.com/remote.glb",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        importer.setUploadedSource(uploaded, "uploaded.glb");
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength),
        });
        await pendingUrl;

        expect(importer.source).toBe("uploaded.glb");
        expect(importer.sourceKind).toBe("upload");
        expect(importer.data).toEqual(uploaded);
    });
});
