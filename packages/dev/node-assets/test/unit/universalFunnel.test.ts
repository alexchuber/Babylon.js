import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { GLTFToUniversalBlock } from "../../src/Blocks/gltfToUniversalBlock";
import { DracoCompressionBlock } from "../../src/Blocks/dracoCompressionBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportGLTFAggregateBlock } from "../../src/Blocks/importGLTFAggregateBlock";
import { KTX2CompressionBlock } from "../../src/Blocks/ktx2CompressionBlock";
import { GLTFInputBlock } from "../../src/Blocks/gltfInputBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { GLTFOutputBlock } from "../../src/Blocks/gltfOutputBlock";
import { CustomAggregateBlock } from "../../src/blockFoundation/customAggregateBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    document.createScene("fixture-scene").addChild(document.createNode("fixture-node"));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function CreateCodecFixtureGlbAsync(): Promise<Uint8Array> {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]))
        .setBuffer(buffer);
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
        .setBuffer(buffer);
    const baseColor = document.createTexture("baseColor").setImage(new Uint8Array(32).fill(1)).setMimeType("image/png");
    const normal = document.createTexture("normal").setImage(new Uint8Array(32).fill(2)).setMimeType("image/png");
    const material = document.createMaterial("material").setBaseColorTexture(baseColor).setNormalTexture(normal);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices).setMaterial(material);
    document.createScene("codec-scene").addChild(document.createNode("codec-node").setMesh(document.createMesh("codec-mesh").addPrimitive(primitive)));
    return await new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(document);
}

async function DecodeCodecFixtureAsync(): Promise<{ width: number; height: number; data: Uint8Array }> {
    const width = 16;
    const height = 16;
    return { width, height, data: new Uint8Array(width * height * 4).fill(128) };
}

function ReadGlbJson(glb: Uint8Array): { extensionsUsed?: string[]; images?: { mimeType?: string }[] } {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jsonChunkLength = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glb.buffer, glb.byteOffset + 20, jsonChunkLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes));
}

describe("Universal glTF funnel", () => {
    it("rejects a serialized glTF-to-Universal connection that skips the explicit transcoder", () => {
        expect(() =>
            NodeAsset.Parse({
                name: "invalid-funnel",
                blocks: [
                    { customType: GLTFInputBlock.ClassName, id: 1, name: "glTF", data: null, source: null },
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

    it("builds a valid GLB through the explicit glTF and Universal primitive path", async () => {
        const asset = new NodeAsset("explicit-funnel");
        const read = new GLTFInputBlock("glTF", asset);
        read.data = await CreateFixtureGlbAsync();
        read.source = "fixture.glb";
        const toUniversal = new GLTFToUniversalBlock("glTF → Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", asset);
        const write = new GLTFOutputBlock("glTF", asset);

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

    it("keeps both delivery codecs on the explicit glTF target lane", () => {
        const asset = new NodeAsset("codec-lane-types");
        const toUniversal = new GLTFToUniversalBlock("glTF → Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", asset);
        const ktx2 = new KTX2CompressionBlock("Compress Textures (KTX2)", asset);
        const draco = new DracoCompressionBlock("Compress Geometry (Draco)", asset);

        expect(ktx2.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(ktx2.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(draco.input.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(draco.output.type).toBe(NodeAssetConnectionPointType.GLTF_DOCUMENT);
        expect(() => toUniversal.output.connectTo(ktx2.input)).toThrow(/incompatible connection point types/);
        expect(() => toUniversal.output.connectTo(draco.input)).toThrow(/incompatible connection point types/);
        expect(() => toGltf.output.connectTo(ktx2.input)).not.toThrow();
        expect(() => ktx2.output.connectTo(draco.input)).not.toThrow();
    });

    it("builds KTX2 textures and Draco geometry through the advanced explicit delivery lane", async () => {
        const asset = new NodeAsset("advanced-codec-lane");
        const read = new GLTFInputBlock("glTF", asset);
        read.data = await CreateCodecFixtureGlbAsync();
        read.source = "codec-fixture.glb";
        const toUniversal = new GLTFToUniversalBlock("glTF → Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", asset);
        const ktx2 = new KTX2CompressionBlock("Compress Textures (KTX2)", asset);
        ktx2.imageDecoder = DecodeCodecFixtureAsync;
        const draco = new DracoCompressionBlock("Compress Geometry (Draco)", asset);
        const write = new GLTFOutputBlock("glTF", asset);
        write.fileName = "advanced-codecs";

        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(toGltf.input);
        toGltf.output.connectTo(ktx2.input);
        ktx2.output.connectTo(draco.input);
        draco.output.connectTo(write.input);

        const result = await asset.buildAsync();
        const built = ReadGlbJson(result);

        expect(result.byteLength).toBeGreaterThan(0);
        expect(built.extensionsUsed).toContain("KHR_texture_basisu");
        expect(built.extensionsUsed).toContain("KHR_draco_mesh_compression");
        expect(built.images?.map((image) => image.mimeType)).toEqual(["image/ktx2", "image/ktx2"]);
    }, 20000);

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
            blocks: [{ customType: GLTFInputBlock.ClassName }, { customType: GLTFToUniversalBlock.ClassName }],
        });
        expect(serializedExport?.aggregateVersion).toBe(1);
        expect(serializedExport?.subgraph).toMatchObject({
            blocks: [{ customType: UniversalToGLTFBlock.ClassName }, { customType: GLTFOutputBlock.ClassName, fileName: "aggregate-result" }],
        });

        const aggregateResult = await NodeAsset.Parse(JSON.parse(JSON.stringify(serialized))).buildAsync();

        const primitiveAsset = new NodeAsset("primitive-funnel");
        const read = new GLTFInputBlock("glTF", primitiveAsset);
        read.data = source;
        read.source = "fixture.glb";
        const toUniversal = new GLTFToUniversalBlock("glTF → Universal", primitiveAsset);
        const toGltf = new UniversalToGLTFBlock("Universal → glTF", primitiveAsset);
        const write = new GLTFOutputBlock("glTF", primitiveAsset);
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
                blocks: [{ customType: UniversalToGLTFBlock.ClassName }, { customType: GLTFOutputBlock.ClassName }],
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

    it("keeps a glTF source cleared when an earlier URL request succeeds later", async () => {
        const asset = new NodeAsset("cleared-gltf-source");
        const read = new GLTFInputBlock("glTF", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;
        const pendingUrl = read.setUrlAsync(
            "https://example.com/delayed.glb",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );

        read.clearSource();
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });
        await pendingUrl;

        expect(read.data).toBeNull();
        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
    });
});
