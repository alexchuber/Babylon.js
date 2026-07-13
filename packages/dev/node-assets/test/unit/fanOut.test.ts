import { type Document } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";

import { DedupBlock } from "../../src/Blocks/dedupBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { ImportGLTFBlock } from "../../src/Blocks/importGLTFBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { GltfAsset } from "../../src/representations/gltfAsset";
import { CreateTestGltfAsset } from "./testGltfAsset";

// The import/export blocks register the Draco encoder/decoder, so the diamond build needs the real
// draco3dgltf module rather than the stub the global vitest setup installs for @dev/core.
vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

/** Forwards its single GLTF_DOCUMENT input to its single output unchanged. */
class PassThroughBlock extends NodeAssetBlock {
    public static override ClassName = "PassThroughBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.input.value;
    }
}

/**
 * A two-input SCENE sink used to reconverge a diamond's branches at the terminal. It reads both
 * branches and forwards one along; this slice shares the payload (no cloning), so both inputs carry
 * the same upstream `Document`.
 */
class MergeProbeBlock extends NodeAssetBlock {
    public static override ClassName = "MergeProbeBlock";

    public readonly inputA = this._registerInput("inputA", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    public readonly inputB = this._registerInput("inputB", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.inputA.value;
    }
}

/**
 * Builds a tiny uncompressed glb (one node, one mesh) in code so the diamond build does not depend
 * on a bundled binary fixture.
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

describe("fan-out connections", () => {
    it("lets one output feed multiple inputs while each input keeps a single source", () => {
        const asset = new NodeAsset("fanout-model");
        const importer = new ImportGLTFBlock("import", asset);
        const dedup = new DedupBlock("dedup", asset);
        const prune = new PruneBlock("prune", asset);

        importer.output.connectTo(dedup.input);
        importer.output.connectTo(prune.input);

        // The output tracks both fanned-out inputs; each input still points back to the one output.
        expect(importer.output.isConnected).toBe(true);
        expect(importer.output.connectedPoints).toHaveLength(2);
        expect(importer.output.connectedPoints).toContain(dedup.input);
        expect(importer.output.connectedPoints).toContain(prune.input);
        expect(dedup.input.connectedPoint).toBe(importer.output);
        expect(prune.input.connectedPoint).toBe(importer.output);
    });

    it("disconnecting an output clears every input it fed, symmetrically", () => {
        const asset = new NodeAsset("fanout-disconnect");
        const importer = new ImportGLTFBlock("import", asset);
        const dedup = new DedupBlock("dedup", asset);
        const prune = new PruneBlock("prune", asset);
        importer.output.connectTo(dedup.input);
        importer.output.connectTo(prune.input);

        importer.output.disconnect();

        expect(importer.output.isConnected).toBe(false);
        expect(importer.output.connectedPoints).toHaveLength(0);
        expect(dedup.input.isConnected).toBe(false);
        expect(prune.input.isConnected).toBe(false);
        expect(dedup.input.connectedPoint).toBeNull();
        expect(prune.input.connectedPoint).toBeNull();
    });

    it("disconnecting one fanned-out input leaves the output's other edge intact", () => {
        const asset = new NodeAsset("fanout-partial-disconnect");
        const importer = new ImportGLTFBlock("import", asset);
        const dedup = new DedupBlock("dedup", asset);
        const prune = new PruneBlock("prune", asset);
        importer.output.connectTo(dedup.input);
        importer.output.connectTo(prune.input);

        dedup.input.disconnect();

        expect(dedup.input.isConnected).toBe(false);
        expect(importer.output.connectedPoints).toEqual([prune.input]);
        expect(prune.input.connectedPoint).toBe(importer.output);
    });

    it("reconnecting an input to a new output moves it (an input keeps a single source)", () => {
        const asset = new NodeAsset("fanout-reconnect");
        const first = new DedupBlock("first", asset);
        const second = new PruneBlock("second", asset);
        const consumer = new ExportGLTFBlock("export", asset);

        first.output.connectTo(consumer.input);
        second.output.connectTo(consumer.input);

        expect(consumer.input.connectedPoint).toBe(second.output);
        expect(second.output.connectedPoints).toEqual([consumer.input]);
        // The first output no longer feeds the input it lost.
        expect(first.output.connectedPoints).toHaveLength(0);
        expect(first.output.isConnected).toBe(false);
    });

    it("serializes one connection per fanned-out edge and round-trips both through Parse", () => {
        const asset = new NodeAsset("fanout-roundtrip");
        const importer = new ImportGLTFBlock("import", asset);
        const dedup = new DedupBlock("dedup", asset);
        const prune = new PruneBlock("prune", asset);
        importer.output.connectTo(dedup.input);
        importer.output.connectTo(prune.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));

        // Both fan-out edges survive serialization (the pre-change model dropped one).
        const edgesFromImport = serialized.connections.filter((connection: any) => connection.fromBlock === importer.uniqueId);
        expect(edgesFromImport).toHaveLength(2);

        const parsed = NodeAsset.Parse(serialized);
        const parsedImporter = parsed.attachedBlocks[0] as ImportGLTFBlock;
        const parsedDedup = parsed.attachedBlocks[1] as DedupBlock;
        const parsedPrune = parsed.attachedBlocks[2] as PruneBlock;

        expect(parsedImporter.output.connectedPoints).toHaveLength(2);
        expect(parsedImporter.output.connectedPoints).toContain(parsedDedup.input);
        expect(parsedImporter.output.connectedPoints).toContain(parsedPrune.input);
        expect(parsedDedup.input.connectedPoint).toBe(parsedImporter.output);
        expect(parsedPrune.input.connectedPoint).toBe(parsedImporter.output);
    });
});

describe("evaluate-once", () => {
    it("evaluates a fanned-out producer exactly once and gives each branch its own clone", async () => {
        const glb = await CreateFixtureGlbAsync();

        // Diamond: importer -> {branchA, branchB} -> merge -> exporter. The importer output fans
        // out to both branches, which reconverge at the two-input merge before the terminal export.
        const asset = new NodeAsset("diamond");
        const importer = new ImportGLTFBlock("import", asset);
        importer.data = glb;
        const branchA = new PassThroughBlock("branchA", asset);
        const branchB = new PassThroughBlock("branchB", asset);
        const merge = new MergeProbeBlock("merge", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        importer.output.connectTo(branchA.input);
        importer.output.connectTo(branchB.input);
        branchA.output.connectTo(merge.inputA);
        branchB.output.connectTo(merge.inputB);
        merge.output.connectTo(exporter.input);

        const buildSpy = vi.spyOn(importer, "_buildBlockAsync");

        const result = await asset.buildAsync();

        // The shared producer builds a single time even though two branches consume it.
        expect(buildSpy).toHaveBeenCalledTimes(1);

        // Copy-on-fan-out (slice 05/01) hands each branch its own clone of the fanned-out SCENE, so
        // neither branch holds the canonical evaluated Document and the two copies are independent.
        const canonical = importer.output.value as GltfAsset;
        expect(canonical).not.toBeNull();
        expect(branchA.output.value).not.toBe(canonical);
        expect(branchB.output.value).not.toBe(canonical);
        expect(branchA.output.value).not.toBe(branchB.output.value);

        // The build still succeeds and produces exported bytes.
        expect(result).toBeInstanceOf(Uint8Array);
        expect(result.length).toBeGreaterThan(0);
    }, 20000);

    it("evaluates each block once across a fanned-out diamond (build-count probe)", async () => {
        // A pure-count diamond using lightweight blocks so the assertion is exact and fast: a single
        // counting source fans out to two pass-through branches that reconverge at a two-input merge.
        const asset = new NodeAsset("count-diamond");

        let sourceBuilds = 0;
        class CountingSourceBlock extends NodeAssetBlock {
            public static override ClassName = "CountingSourceBlock";
            public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
            public override async _buildBlockAsync(): Promise<void> {
                sourceBuilds++;
                // A real (empty) Document: copy-on-fan-out clones the fanned-out SCENE, and cloning
                // requires an actual gltf-transform Document rather than a stand-in object.
                const { Document } = await import("@gltf-transform/core");
                this.output.value = CreateTestGltfAsset(new Document(), "counting-source");
            }
        }

        const source = new CountingSourceBlock("source", asset);
        const branchA = new PassThroughBlock("branchA", asset);
        const branchB = new PassThroughBlock("branchB", asset);
        const merge = new MergeProbeBlock("merge", asset);
        const exporter = new ExportGLTFBlock("export", asset);

        source.output.connectTo(branchA.input);
        source.output.connectTo(branchB.input);
        branchA.output.connectTo(merge.inputA);
        branchB.output.connectTo(merge.inputB);
        merge.output.connectTo(exporter.input);

        // Skip the real glb write; this test only asserts the evaluation topology.
        vi.spyOn(exporter, "_buildBlockAsync").mockImplementation(async () => {
            exporter.result = new Uint8Array([1]);
        });

        await asset.buildAsync();

        expect(sourceBuilds).toBe(1);
        // The fanned-out SCENE is cloned per branch (slice 05/01), so each branch holds a distinct copy.
        expect(branchA.output.value).not.toBe(source.output.value);
        expect(branchB.output.value).not.toBe(source.output.value);
        expect(branchA.output.value).not.toBe(branchB.output.value);
    });
});
