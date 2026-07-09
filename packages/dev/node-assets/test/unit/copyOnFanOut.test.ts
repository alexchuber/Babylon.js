import { Document } from "@gltf-transform/core";
import { getBounds } from "@gltf-transform/functions";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CenterBlock } from "../../src/Blocks/centerBlock";
import { ExportGLTFBlock } from "../../src/Blocks/exportGLTFBlock";
import { PruneBlock } from "../../src/Blocks/pruneBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

/** A SCENE source with no inputs: emits a fresh `Document` (via its factory) each build. */
class SceneSourceBlock extends NodeAssetBlock {
    public static override ClassName = "SceneSourceBlock";

    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    // Produces the `Document` this source emits; each build calls it once.
    public documentFactory: () => Document = () => new Document();

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.documentFactory();
    }
}

/** Forwards its single SCENE input to its single SCENE output unchanged (a branch that only reads). */
class SceneReaderBlock extends NodeAssetBlock {
    public static override ClassName = "SceneReaderBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.input.value;
    }
}

/** Sets the first node's translation on the incoming `Document` in place, then forwards it (a mutating branch). */
class SetNodeTranslationBlock extends NodeAssetBlock {
    public static override ClassName = "SetNodeTranslationBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    /** The translation to write onto the first node of the input `Document`. */
    public translation: [number, number, number] = [0, 0, 0];

    public override async _buildBlockAsync(): Promise<void> {
        const document = this.input.value as Document;
        document.getRoot().listNodes()[0].setTranslation(this.translation);
        this.output.value = document;
    }
}

/** A two-input SCENE sink used to reconverge a diamond's branches at the terminal. */
class SceneMergeSinkBlock extends NodeAssetBlock {
    public static override ClassName = "SceneMergeSinkBlock";

    public readonly inputA = this._registerInput("inputA", NodeAssetConnectionPointType.SCENE);
    public readonly inputB = this._registerInput("inputB", NodeAssetConnectionPointType.SCENE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.inputA.value;
    }
}

/** A JSON source with no inputs: emits an arbitrary immutable payload. */
class JsonSourceBlock extends NodeAssetBlock {
    public static override ClassName = "JsonSourceBlock";

    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);

    /** The JSON payload this source emits. */
    public payload: unknown = null;

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.payload;
    }
}

/** Consumes two JSON inputs and produces a SCENE, so scalar fan-out can still reach the SCENE terminal. */
class ScalarPairToSceneBlock extends NodeAssetBlock {
    public static override ClassName = "ScalarPairToSceneBlock";

    public readonly inputA = this._registerInput("inputA", NodeAssetConnectionPointType.JSON);
    public readonly inputB = this._registerInput("inputB", NodeAssetConnectionPointType.JSON);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = new Document();
    }
}

/**
 * Builds a `Document` with a single node at the given translation.
 * @param translation - The translation to assign to the node.
 * @returns The new single-node document.
 */
function CreateSingleNodeDocument(translation: [number, number, number]): Document {
    const document = new Document();
    const node = document.createNode("node0").setTranslation(translation);
    document.createScene("scene0").addChild(node);
    return document;
}

/**
 * Builds a `Document` with geometry offset from the origin plus an unused (orphan) material.
 * @param offset - The amount to offset every vertex from the origin on each axis.
 * @returns The new document.
 */
function CreateOffsetGeometryDocument(offset: number): Document {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([offset, offset, offset, offset + 1, offset, offset, offset, offset + 1, offset]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);
    document.createMaterial("orphan");
    return document;
}

/**
 * Computes the X coordinate of the center of a `Document`'s first scene's bounding box.
 * @param document - The document to measure.
 * @returns The bounding-box center X.
 */
function SceneCenterX(document: Document): number {
    const bounds = getBounds(document.getRoot().listScenes()[0]);
    return (bounds.min[0] + bounds.max[0]) / 2;
}

/**
 * Adds a terminal export block whose real glb write is stubbed out (the tests assert on branch
 * state, not exported bytes).
 * @param asset - The node asset to attach the exporter to.
 * @returns The stubbed export block.
 */
function AttachStubbedExporter(asset: NodeAsset): ExportGLTFBlock {
    const exporter = new ExportGLTFBlock("export", asset);
    vi.spyOn(exporter, "_buildBlockAsync").mockImplementation(async () => {
        exporter.result = new Uint8Array([1]);
    });
    return exporter;
}

describe("copy-on-fan-out (SCENE payloads)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("gives each fanned-out SCENE consumer its own Document clone", async () => {
        const asset = new NodeAsset("clone-per-consumer");
        const source = new SceneSourceBlock("source", asset);
        source.documentFactory = () => CreateSingleNodeDocument([0, 0, 0]);
        const branchA = new SceneReaderBlock("branchA", asset);
        const branchB = new SceneReaderBlock("branchB", asset);
        const sink = new SceneMergeSinkBlock("sink", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(branchA.input);
        source.output.connectTo(branchB.input);
        branchA.output.connectTo(sink.inputA);
        branchB.output.connectTo(sink.inputB);
        sink.output.connectTo(exporter.input);

        await asset.buildAsync();

        // Each consumer holds its own clone, so none of them holds the canonical evaluated Document.
        const canonical = source.output.value as Document;
        expect(branchA.input.value).not.toBe(canonical);
        expect(branchB.input.value).not.toBe(canonical);
        expect(branchA.input.value).not.toBe(branchB.input.value);
        // The clone is a faithful copy of the source scene.
        expect((branchA.input.value as Document).getRoot().listNodes()).toHaveLength(1);
    });

    it("isolates in-place mutations across a same-source diamond (regression)", async () => {
        // One source scene fans out to two branches that set the SAME node's translation to DIFFERENT
        // values. Without copy-on-fan-out they share one Document and last-writer-wins clobbers a branch.
        const asset = new NodeAsset("diamond-isolation");
        const source = new SceneSourceBlock("source", asset);
        source.documentFactory = () => CreateSingleNodeDocument([0, 0, 0]);
        const branchA = new SetNodeTranslationBlock("branchA", asset);
        branchA.translation = [1, 0, 0];
        const branchB = new SetNodeTranslationBlock("branchB", asset);
        branchB.translation = [2, 0, 0];
        const sink = new SceneMergeSinkBlock("sink", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(branchA.input);
        source.output.connectTo(branchB.input);
        branchA.output.connectTo(sink.inputA);
        branchB.output.connectTo(sink.inputB);
        sink.output.connectTo(exporter.input);

        await asset.buildAsync();

        const docA = branchA.output.value as Document;
        const docB = branchB.output.value as Document;
        expect(docA).not.toBe(docB);
        expect(docA.getRoot().listNodes()[0].getTranslation()).toEqual([1, 0, 0]);
        expect(docB.getRoot().listNodes()[0].getTranslation()).toEqual([2, 0, 0]);
    });

    it("keeps two different operator branches from interfering", async () => {
        // A real-operator diamond: one branch centers the geometry, the other prunes the orphan
        // material. Each branch's output must reflect only its own operator, not the other's.
        const asset = new NodeAsset("operator-isolation");
        const source = new SceneSourceBlock("source", asset);
        source.documentFactory = () => CreateOffsetGeometryDocument(10);
        const centerBranch = new CenterBlock("center", asset);
        const pruneBranch = new PruneBlock("prune", asset);
        const sink = new SceneMergeSinkBlock("sink", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(centerBranch.input);
        source.output.connectTo(pruneBranch.input);
        centerBranch.output.connectTo(sink.inputA);
        pruneBranch.output.connectTo(sink.inputB);
        sink.output.connectTo(exporter.input);

        await asset.buildAsync();

        const centered = centerBranch.output.value as Document;
        const pruned = pruneBranch.output.value as Document;
        expect(centered).not.toBe(pruned);
        // The center branch recentered its geometry and kept the (unpruned) orphan material.
        expect(SceneCenterX(centered)).toBeCloseTo(0, 4);
        expect(centered.getRoot().listMaterials()).toHaveLength(1);
        // The prune branch removed the orphan material and left its geometry where it was.
        expect(SceneCenterX(pruned)).toBeCloseTo(10.5, 4);
        expect(pruned.getRoot().listMaterials()).toHaveLength(0);
    });

    it("shares immutable scalar payloads by reference on fan-out", async () => {
        const asset = new NodeAsset("scalar-sharing");
        const source = new JsonSourceBlock("source", asset);
        const payload = { tag: "shared-config" };
        source.payload = payload;
        const consumer = new ScalarPairToSceneBlock("consumer", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(consumer.inputA);
        source.output.connectTo(consumer.inputB);
        consumer.output.connectTo(exporter.input);

        await asset.buildAsync();

        // Immutable scalars are never cloned: every consumer sees the very same reference.
        expect(consumer.inputA.value).toBe(payload);
        expect(consumer.inputB.value).toBe(payload);
        expect(consumer.inputA.value).toBe(source.output.value);
    });

    it("does not clone a single-consumer SCENE edge", async () => {
        const asset = new NodeAsset("single-consumer");
        const source = new SceneSourceBlock("source", asset);
        source.documentFactory = () => CreateSingleNodeDocument([3, 4, 5]);
        const reader = new SceneReaderBlock("reader", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(reader.input);
        reader.output.connectTo(exporter.input);

        await asset.buildAsync();

        // A sole consumer shares the one Document; a linear edge is never cloned.
        expect(reader.input.value).toBe(source.output.value);
    });

    it("evaluates a fanned-out upstream once and clones at propagation, not by re-evaluating it", async () => {
        const asset = new NodeAsset("evaluate-once-clone");
        const source = new SceneSourceBlock("source", asset);
        source.documentFactory = () => CreateSingleNodeDocument([0, 0, 0]);
        const branchA = new SceneReaderBlock("branchA", asset);
        const branchB = new SceneReaderBlock("branchB", asset);
        const sink = new SceneMergeSinkBlock("sink", asset);
        const exporter = AttachStubbedExporter(asset);

        source.output.connectTo(branchA.input);
        source.output.connectTo(branchB.input);
        branchA.output.connectTo(sink.inputA);
        branchB.output.connectTo(sink.inputB);
        sink.output.connectTo(exporter.input);

        const buildSpy = vi.spyOn(source, "_buildBlockAsync");

        await asset.buildAsync();

        // The shared upstream is evaluated exactly once...
        expect(buildSpy).toHaveBeenCalledTimes(1);
        // ...yet each branch still received its own clone, so the clone happens at value propagation
        // rather than by re-running the upstream: the two inputs are distinct Documents.
        expect(branchA.input.value).not.toBe(branchB.input.value);
    });
});
