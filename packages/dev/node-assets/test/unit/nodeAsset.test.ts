import { describe, expect, it, vi } from "vitest";

import { DracoCompressionBlock, DracoEncoderMethod } from "../../src/Blocks/dracoCompressionBlock";
import { DedupBlock } from "../../src/Blocks/dedupBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { KTX2CompressionBlock } from "../../src/Blocks/ktx2CompressionBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { type IExportBlock } from "../../src/blockFoundation/exportBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { GetNodeAssetBuildErrorContext } from "../../src/nodeAssetBuildError";

// The import/export blocks register the Draco encoder/decoder, so the roundtrip needs the real
// draco3dgltf module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

class ConcurrentSourceBlock extends NodeAssetBlock {
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);
    public evaluations = 0;

    public override async _buildBlockAsync(): Promise<void> {
        this.evaluations++;
        await Promise.resolve();
        this.output.value = { data: new Uint8Array([7]), mimeType: "image/png" };
    }
}

class ImagePassThroughBlock extends NodeAssetBlock {
    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.IMAGE);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.input.value;
    }
}

class ConcurrentFanInExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly inputA: NodeAssetConnectionPoint;
    public readonly inputB: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.inputA = this._registerInput("inputA", NodeAssetConnectionPointType.IMAGE);
        this.inputB = this._registerInput("inputB", NodeAssetConnectionPointType.IMAGE);
    }

    public override async _buildBlockAsync(): Promise<void> {
        if (this.inputA.value !== this.inputB.value) {
            throw new Error("Concurrent scalar fan-in did not preserve shared identity.");
        }
        this.result = (this.inputA.value as { data: Uint8Array }).data;
    }
}

class OneShotExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly input: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;
    private _evaluations = 0;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.IMAGE);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this._evaluations++;
        if (this._evaluations === 1) {
            this.result = (this.input.value as { data: Uint8Array }).data;
        }
    }
}

class ThrowingExportBlock extends NodeAssetBlock implements IExportBlock {
    public readonly isExportTerminal = true;
    public result: Uint8Array | null = null;
    public readonly error = new Error("operator failed");

    public override async _buildBlockAsync(): Promise<void> {
        throw this.error;
    }
}

/**
 * Builds a tiny uncompressed glb (one node, one mesh) in code so the roundtrip test does not
 * depend on a bundled binary fixture.
 * @returns The fixture glb bytes.
 */
async function CreateFixtureGlbAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return await io.writeBinary(document);
}

describe("NodeAsset", () => {
    it("registers blocks with the asset on construction", () => {
        const asset = new NodeAsset("roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        expect(asset.attachedBlocks).toContain(importer);
        expect(asset.attachedBlocks).toContain(exporter);
        expect(asset.attachedBlocks).toHaveLength(2);
    });

    it("imports and exports a glTF, preserving node and mesh counts", async () => {
        const glb = await CreateFixtureGlbAsync();

        const asset = new NodeAsset("roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const result = await asset.buildAsync();

        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);

        // Re-parse the exported bytes to prove a genuine read/write roundtrip, not a passthrough.
        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const reparsed = await io.readBinary(result);

        expect(reparsed.getRoot().listNodes()).toHaveLength(1);
        expect(reparsed.getRoot().listMeshes()).toHaveLength(1);
    });

    it("throws when the export block's required input is not connected", async () => {
        const asset = new NodeAsset("missing-input");
        const exporter = new ExportGLTFBlock("export", asset);

        expect(exporter.result).toBeNull();
        await expect(asset.buildAsync()).rejects.toMatchObject({
            name: "NodeAssetBuildError",
            blockId: exporter.uniqueId,
            inputName: "input",
            message: 'The "input" input of the "export" block is not connected.',
        });
    });

    it("rejects a cyclic graph with the block that closes the cycle", async () => {
        const asset = new NodeAsset("cycle");
        const first = new DedupBlock("first", asset);
        const second = new PruneBlock("second", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        first.output.connectTo(second.input);
        second.output.connectTo(first.input);
        second.output.connectTo(exporter.input);

        const result = Promise.race([
            asset.buildAsync(),
            new Promise<Uint8Array>((_, reject) => {
                setTimeout(() => reject(new Error("Cycle detection timed out.")), 50);
            }),
        ]);

        await expect(result).rejects.toMatchObject({
            name: "NodeAssetBuildError",
            blockId: second.uniqueId,
            message: expect.stringContaining("cycle"),
        });
    });

    it("attributes a block execution failure to that block", async () => {
        const asset = new NodeAsset("block-failure");
        const exporter = new ThrowingExportBlock("broken operator", asset);

        const thrown = await asset.buildAsync().catch((error: unknown) => error);

        expect(thrown).toBe(exporter.error);
        expect(GetNodeAssetBuildErrorContext(thrown)).toEqual({
            blockId: exporter.uniqueId,
            inputName: undefined,
        });
    });

    it("disconnects a connected point pair symmetrically", () => {
        const asset = new NodeAsset("disconnect");
        const importer = new ImportGLTFBlock("import", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        expect(importer.output.isConnected).toBe(true);
        expect(exporter.input.isConnected).toBe(true);

        importer.output.disconnect();

        expect(importer.output.isConnected).toBe(false);
        expect(exporter.input.isConnected).toBe(false);
        expect(importer.output.connectedPoints).toHaveLength(0);
        expect(exporter.input.connectedPoint).toBeNull();
    });

    it("removes a block and disconnects it from the graph", () => {
        const asset = new NodeAsset("remove");
        const importer = new ImportGLTFBlock("import", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        asset.removeBlock(importer);

        expect(asset.attachedBlocks).not.toContain(importer);
        expect(asset.attachedBlocks).toHaveLength(1);
        expect(exporter.input.isConnected).toBe(false);
    });

    it("roundtrips through serialize/Parse, restoring blocks, connections, and import data", async () => {
        const glb = await CreateFixtureGlbAsync();

        const asset = new NodeAsset("serialize-me");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // Block identity and count are preserved (in order).
        expect(parsed.name).toBe("serialize-me");
        expect(parsed.attachedBlocks).toHaveLength(2);
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFBlock;
        const parsedExporter = parsed.attachedBlocks[1] as ExportGLTFBlock;
        expect(parsedImporter).toBeInstanceOf(ImportGLTFBlock);
        expect(parsedExporter).toBeInstanceOf(ExportGLTFBlock);
        expect(parsedImporter.uniqueId).toBe(importer.uniqueId);

        // Import data survived the base64 roundtrip.
        expect(parsedImporter.data).toEqual(glb);

        // The connection was restored, so the parsed graph builds without re-wiring.
        expect(parsedImporter.output.connectedPoints[0]).toBe(parsedExporter.input);
        const result = await parsed.buildAsync();
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
    });

    it("reconstructs a DracoCompressionBlock through serialize/Parse and restores its wiring", async () => {
        const glb = await CreateFixtureGlbAsync();

        const asset = new NodeAsset("draco-serialize");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const draco = new DracoCompressionBlock("draco", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(draco.input);
        draco.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        // The middle block is reconstructed as a DracoCompressionBlock, in order.
        expect(parsed.attachedBlocks).toHaveLength(3);
        const parsedDraco = parsed.attachedBlocks[1];
        expect(parsedDraco).toBeInstanceOf(DracoCompressionBlock);

        // Its wiring is restored on both sides (import -> draco -> export).
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFBlock;
        const parsedExporter = parsed.attachedBlocks[2] as ExportGLTFBlock;
        expect(parsedImporter.output.connectedPoints[0]).toBe((parsedDraco as DracoCompressionBlock).input);
        expect((parsedDraco as DracoCompressionBlock).output.connectedPoints[0]).toBe(parsedExporter.input);
    });

    it("reconstructs KTX2 and Draco compression blocks through serialize/Parse and restores their wiring", () => {
        const asset = new NodeAsset("compression-serialize");
        const importer = new ImportGLTFBlock("import", asset);
        const ktx2 = new KTX2CompressionBlock("ktx2", asset);
        const draco = new DracoCompressionBlock("draco", asset);
        const exporter = new ExportGLTFBlock("export", asset);
        importer.output.connectTo(ktx2.input);
        ktx2.output.connectTo(draco.input);
        draco.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        const parsed = NodeAsset.Parse(serialized);

        expect(parsed.attachedBlocks).toHaveLength(4);
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFBlock;
        const parsedKtx2 = parsed.attachedBlocks[1] as KTX2CompressionBlock;
        const parsedDraco = parsed.attachedBlocks[2] as DracoCompressionBlock;
        const parsedExporter = parsed.attachedBlocks[3] as ExportGLTFBlock;
        expect(parsedKtx2).toBeInstanceOf(KTX2CompressionBlock);
        expect(parsedDraco).toBeInstanceOf(DracoCompressionBlock);
        expect(parsedKtx2.dataSRGBTransferFunction).toBe(false);

        expect(parsedImporter.output.connectedPoints[0]).toBe(parsedKtx2.input);
        expect(parsedKtx2.output.connectedPoints[0]).toBe(parsedDraco.input);
        expect(parsedDraco.output.connectedPoints[0]).toBe(parsedExporter.input);
    });

    it("roundtrips the complete delivery codec options through serialize/Parse", () => {
        const asset = new NodeAsset("compression-options");
        const ktx2 = new KTX2CompressionBlock("ktx2", asset);
        ktx2.generateMipmaps = true;
        ktx2.texturePattern = "hero-.*";
        ktx2.colorTextureSlots = "baseColor";
        ktx2.dataTextureSlots = "normal";
        ktx2.outputContainer = "ktx2";
        ktx2.etc1sQualityLevel = 200;
        ktx2.etc1sCompressionLevel = 4;
        ktx2.uastcQualityLevel = 3;
        ktx2.colorPerceptual = false;
        ktx2.dataPerceptual = true;
        ktx2.colorSRGBTransferFunction = false;
        ktx2.dataSRGBTransferFunction = false;
        ktx2.enableRDO = true;
        ktx2.rdoQualityLevel = 0;
        ktx2.useZstandard = false;
        ktx2.normalMapTuning = true;
        ktx2.flipY = true;
        ktx2.hdr = false;
        ktx2.hdrSourceType = "exr";
        ktx2.hdrQualityLevel = 4;
        ktx2.metadata = { author: "Babylon.js" };
        ktx2.enableDebug = true;
        ktx2.jsUrl = "/encoder/basis.js";
        ktx2.wasmUrl = "/encoder/basis.wasm";
        const draco = new DracoCompressionBlock("draco", asset);
        draco.method = DracoEncoderMethod.Sequential;
        draco.encodeSpeed = 2;
        draco.decodeSpeed = 8;
        draco.quantizationBits = { POSITION: 12, NORMAL: 8, COLOR: 7, TEX_COORD: 11, GENERIC: 9 };
        draco.quantizationVolume = "custom";
        draco.customBoundsMin = [-2, -3, -4];
        draco.customBoundsMax = [2, 3, 4];

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        expect(serialized.blocks[0]).toMatchObject({
            generateMipmaps: true,
            texturePattern: "hero-.*",
            colorTextureSlots: "baseColor",
            dataTextureSlots: "normal",
            outputContainer: "ktx2",
            etc1sQualityLevel: 200,
            etc1sCompressionLevel: 4,
            uastcQualityLevel: 3,
            colorPerceptual: false,
            dataPerceptual: true,
            colorSRGBTransferFunction: false,
            dataSRGBTransferFunction: false,
            enableRDO: true,
            rdoQualityLevel: 0,
            useZstandard: false,
            normalMapTuning: true,
            flipY: true,
            hdr: false,
            hdrSourceType: "exr",
            hdrQualityLevel: 4,
            metadata: { author: "Babylon.js" },
            enableDebug: true,
            jsUrl: "/encoder/basis.js",
            wasmUrl: "/encoder/basis.wasm",
        });
        expect(serialized.blocks[1]).toMatchObject({
            method: DracoEncoderMethod.Sequential,
            encodeSpeed: 2,
            decodeSpeed: 8,
            quantizationBits: { POSITION: 12, NORMAL: 8, COLOR: 7, TEX_COORD: 11, GENERIC: 9 },
            quantizationVolume: "custom",
            customBoundsMin: [-2, -3, -4],
            customBoundsMax: [2, 3, 4],
        });

        const parsed = NodeAsset.Parse(serialized);
        const parsedKtx2 = parsed.attachedBlocks[0] as KTX2CompressionBlock;
        const parsedDraco = parsed.attachedBlocks[1] as DracoCompressionBlock;
        expect(parsedKtx2).toMatchObject({
            generateMipmaps: true,
            texturePattern: "hero-.*",
            colorTextureSlots: "baseColor",
            dataTextureSlots: "normal",
            outputContainer: "ktx2",
            etc1sQualityLevel: 200,
            etc1sCompressionLevel: 4,
            uastcQualityLevel: 3,
            colorPerceptual: false,
            dataPerceptual: true,
            colorSRGBTransferFunction: false,
            dataSRGBTransferFunction: false,
            enableRDO: true,
            rdoQualityLevel: 0,
            useZstandard: false,
            normalMapTuning: true,
            flipY: true,
            hdr: false,
            hdrSourceType: "exr",
            hdrQualityLevel: 4,
            metadata: { author: "Babylon.js" },
            enableDebug: true,
            jsUrl: "/encoder/basis.js",
            wasmUrl: "/encoder/basis.wasm",
        });
        expect(parsedDraco.method).toBe(DracoEncoderMethod.Sequential);
        expect(parsedDraco.encodeSpeed).toBe(2);
        expect(parsedDraco.decodeSpeed).toBe(8);
        expect(parsedDraco.quantizationBits).toEqual({ POSITION: 12, NORMAL: 8, COLOR: 7, TEX_COORD: 11, GENERIC: 9 });
        expect(parsedDraco.quantizationVolume).toBe("custom");
        expect(parsedDraco.customBoundsMin).toEqual([-2, -3, -4]);
        expect(parsedDraco.customBoundsMax).toEqual([2, 3, 4]);
    });

    it("rejects malformed serialized delivery codec options", () => {
        const asset = new NodeAsset("invalid-compression-options");
        const ktx2 = new KTX2CompressionBlock("ktx2", asset);
        const draco = new DracoCompressionBlock("draco", asset);
        const serialized = JSON.parse(JSON.stringify(asset.serialize()));

        serialized.blocks[0].texturePattern = "[";
        expect(() => NodeAsset.Parse(serialized)).toThrow(/texturePattern/);

        serialized.blocks[0] = ktx2.serialize();
        serialized.blocks[1] = draco.serialize();
        serialized.blocks[1].encodeSpeed = 11;
        expect(() => NodeAsset.Parse(serialized)).toThrow(/encodeSpeed/);

        serialized.blocks[1] = draco.serialize();
        serialized.blocks[1].customBoundsMin = [1, 0, 0];
        serialized.blocks[1].customBoundsMax = [0, 1, 1];
        expect(() => NodeAsset.Parse(serialized)).not.toThrow();

        serialized.blocks[1].quantizationVolume = "custom";
        expect(() => NodeAsset.Parse(serialized)).toThrow(/custom bounds/);
    });

    it("deduplicates a concurrently reached upstream across fan-in", async () => {
        const asset = new NodeAsset("concurrent fan-in");
        const source = new ConcurrentSourceBlock("source", asset);
        const branchA = new ImagePassThroughBlock("branch A", asset);
        const branchB = new ImagePassThroughBlock("branch B", asset);
        const exporter = new ConcurrentFanInExportBlock("export", asset);
        source.output.connectTo(branchA.input);
        source.output.connectTo(branchB.input);
        branchA.output.connectTo(exporter.inputA);
        branchB.output.connectTo(exporter.inputB);

        const result = await asset.buildAsync();

        expect(source.evaluations).toBe(1);
        expect(Array.from(result)).toEqual([7]);
    });

    it("does not reuse terminal bytes when a later build produces no result", async () => {
        const asset = new NodeAsset("one-shot export");
        const source = new ConcurrentSourceBlock("source", asset);
        const exporter = new OneShotExportBlock("export", asset);
        source.output.connectTo(exporter.input);

        await expect(asset.buildAsync()).resolves.toEqual(new Uint8Array([7]));
        await expect(asset.buildAsync()).rejects.toThrow('The "one-shot export" node asset produced no result.');
    });
});
