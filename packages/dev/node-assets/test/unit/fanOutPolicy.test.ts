import { Document } from "@gltf-transform/core";
import { NullEngine } from "core/Engines/nullEngine";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { Scene } from "core/scene";
import { type IResolvedStage } from "loaders/USD";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ImagePayload } from "../../src/Blocks/imagePayload";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { BuildFanOutError } from "../../src/evaluation/fanOutCopy";
import { NodeAsset } from "../../src/nodeAsset";
import { BabylonAsset } from "../../src/representations/babylonAsset";
import { GltfAsset } from "../../src/representations/gltfAsset";
import { NodeGeometryAsset } from "../../src/representations/nodeGeometryAsset";
import { UsdAsset } from "../../src/representations/usdAsset";

class ValueSourceBlock extends NodeAssetBlock {
    public readonly output: NodeAssetConnectionPoint;
    public value: unknown;

    public constructor(name: string, nodeAsset: NodeAsset, type: NodeAssetConnectionPointType, value: unknown) {
        super(name, nodeAsset);
        this.output = this._registerOutput("output", type);
        this.value = value;
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.output.value = this.value;
    }
}

class CaptureBranchBlock extends NodeAssetBlock {
    public readonly input: NodeAssetConnectionPoint;
    public readonly output: NodeAssetConnectionPoint;
    public captured: unknown;
    public capture: ((value: unknown) => void) | undefined;

    public constructor(name: string, nodeAsset: NodeAsset, type: NodeAssetConnectionPointType) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", type);
        this.output = this._registerOutput("output", type);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.captured = this.input.value;
        this.capture?.(this.input.value);
        this.output.value = this.input.value;
    }
}

class PairExportBlock extends NodeAssetBlock {
    public readonly isExportTerminal = true;
    public readonly inputA: NodeAssetConnectionPoint;
    public readonly inputB: NodeAssetConnectionPoint;
    public result: Uint8Array | null = null;

    public constructor(name: string, nodeAsset: NodeAsset, type: NodeAssetConnectionPointType) {
        super(name, nodeAsset);
        this.inputA = this._registerInput("inputA", type);
        this.inputB = this._registerInput("inputB", type);
    }

    public override async _buildBlockAsync(): Promise<void> {
        this.result = new Uint8Array([1]);
    }
}

function CreateFanOutGraph(
    type: NodeAssetConnectionPointType,
    value: unknown
): {
    asset: NodeAsset;
    branchA: CaptureBranchBlock;
    branchB: CaptureBranchBlock;
} {
    const asset = new NodeAsset("fan-out policy");
    const source = new ValueSourceBlock("source", asset, type, value);
    const branchA = new CaptureBranchBlock("branch A", asset, type);
    const branchB = new CaptureBranchBlock("branch B", asset, type);
    const exporter = new PairExportBlock("export", asset, type);
    source.output.connectTo(branchA.input);
    source.output.connectTo(branchB.input);
    branchA.output.connectTo(exporter.inputA);
    branchB.output.connectTo(exporter.inputB);
    return { asset, branchA, branchB };
}

function CreateResolvedStage(): IResolvedStage {
    return {
        metadata: {
            upAxis: "Y",
            metersPerUnit: 1,
            timeCodesPerSecond: 24,
            startTimeCode: 0,
            endTimeCode: 0,
        },
        root: {
            path: "/",
            name: "",
            kind: "transform",
            transform: {
                translation: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
            },
            visible: true,
            children: [],
        },
        meshes: [],
        materials: [],
        skeletons: [],
        diagnostics: [],
    };
}

describe("four-way fan-out policy", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("structurally clones each GltfAsset consumer while preserving identity, revision, and manifest", async () => {
        const document = new Document();
        document.createScene("scene").addChild(document.createNode("node"));
        const source = new GltfAsset(document, {
            identity: "gltf-source",
            revision: 3,
            manifest: { format: "gltf" },
        });
        const { asset, branchA, branchB } = CreateFanOutGraph(NodeAssetConnectionPointType.GLTF_DOCUMENT, source);

        await asset.buildAsync();

        const copyA = branchA.captured as GltfAsset;
        const copyB = branchB.captured as GltfAsset;
        expect(copyA).not.toBe(source);
        expect(copyB).not.toBe(source);
        expect(copyA).not.toBe(copyB);
        expect(copyA.document).not.toBe(source.document);
        expect(copyA.document.getRoot().listNodes()).toHaveLength(1);
        expect(copyA).toMatchObject({
            identity: "gltf-source",
            revision: 3,
            manifest: { format: "gltf" },
        });
        expect(source.isDisposed).toBe(true);
        expect(copyA.isDisposed).toBe(true);
        expect(copyB.isDisposed).toBe(true);
    });

    it("shares the exact frozen USD stage and independently copies each immutable overlay", async () => {
        const source = new UsdAsset(CreateResolvedStage(), {
            identity: "usd-source",
            revision: 4,
            manifest: { format: "usd" },
            overlay: { "/World": { visibility: "inherited" } },
        });
        const { asset, branchA, branchB } = CreateFanOutGraph(NodeAssetConnectionPointType.USD_STAGE, source);

        await asset.buildAsync();

        const copyA = branchA.captured as UsdAsset;
        const copyB = branchB.captured as UsdAsset;
        expect(copyA).not.toBe(source);
        expect(copyB).not.toBe(source);
        expect(copyA.stage).toBe(source.stage);
        expect(copyB.stage).toBe(source.stage);
        expect(copyA.overlay).toEqual(source.overlay);
        expect(copyA.overlay).not.toBe(source.overlay);
        expect(copyA.overlay).not.toBe(copyB.overlay);
        expect(Object.isFrozen(copyA.overlay)).toBe(true);
        expect(source.isDisposed).toBe(true);
        expect(copyA.isDisposed).toBe(true);
        expect(copyB.isDisposed).toBe(true);
    });

    it("rejects implicit BabylonAsset fan-out with a typed affine diagnostic and disposes the source", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const source = new BabylonAsset(engine, scene, {
            identity: "babylon-source",
            revision: 1,
            manifest: { format: "babylon" },
        });
        const { asset } = CreateFanOutGraph(NodeAssetConnectionPointType.BABYLON_SCENE, source);

        await expect(asset.buildAsync()).rejects.toMatchObject<BuildFanOutError>({
            code: "NODE_ASSET_AFFINE_FAN_OUT",
            diagnostic: {
                code: "NODE_ASSET_AFFINE_FAN_OUT",
                severity: "error",
                producer: { kind: "block", blockName: "source" },
            },
        });
        expect(scene.isDisposed).toBe(true);
    });

    it("clones NodeGeometry through exact serialize/no-build reconstruction with a copied frozen snapshot", async () => {
        const nodeGeometry = new NodeGeometry("procedural fixture");
        nodeGeometry.setToDefault();
        nodeGeometry.comment = "preserve this serialized comment";
        const outputBlock = nodeGeometry.outputBlock!;
        const boxBlock = outputBlock.geometry.connectedPoint!.ownerBlock;
        const sizeBlock = boxBlock.inputs[0].connectedPoint!.ownerBlock;
        nodeGeometry.attachedBlocks.push(sizeBlock, boxBlock, outputBlock);
        const sourceSerialization = nodeGeometry.serialize();
        const vertexData = new VertexData();
        vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        vertexData.indices = [0, 1, 2];
        const source = new NodeGeometryAsset(
            nodeGeometry,
            {
                identity: "node-geometry-source",
                revision: 2,
                manifest: { format: "nodeGeometry" },
            },
            vertexData
        );
        const { asset, branchA, branchB } = CreateFanOutGraph(NodeAssetConnectionPointType.NODE_GEOMETRY, source);
        let serializationA: unknown;
        let serializationB: unknown;
        branchA.capture = (value) => {
            serializationA = (value as NodeGeometryAsset).nodeGeometry.serialize();
        };
        branchB.capture = (value) => {
            serializationB = (value as NodeGeometryAsset).nodeGeometry.serialize();
        };
        const buildSpy = vi.spyOn(NodeGeometry.prototype, "build");

        await asset.buildAsync();

        const copyA = branchA.captured as NodeGeometryAsset;
        const copyB = branchB.captured as NodeGeometryAsset;
        expect(serializationA).toEqual(sourceSerialization);
        expect(serializationB).toEqual(sourceSerialization);
        expect(buildSpy).not.toHaveBeenCalled();
        expect(copyA).not.toBe(source);
        expect(copyA.nodeGeometry).not.toBe(source.nodeGeometry);
        expect(copyA.evaluatedVertexData).not.toBe(source.evaluatedVertexData);
        expect(copyA.evaluatedVertexData?.serialize()).toEqual(source.evaluatedVertexData?.serialize());
        expect(Object.isFrozen(copyA.evaluatedVertexData)).toBe(true);
        expect(copyA).toMatchObject({
            identity: "node-geometry-source",
            revision: 2,
            manifest: { format: "nodeGeometry" },
        });
        expect(copyB.nodeGeometry).not.toBe(copyA.nodeGeometry);
        expect(source.isDisposed).toBe(true);
        expect(copyA.isDisposed).toBe(true);
        expect(copyB.isDisposed).toBe(true);
    });

    it("shares NUMBER, STRING, JSON, and Image values by reference", async () => {
        const image: ImagePayload = { data: new Uint8Array([1, 2]), mimeType: "image/png" };
        const values: ReadonlyArray<[NodeAssetConnectionPointType, unknown]> = [
            [NodeAssetConnectionPointType.NUMBER, 7],
            [NodeAssetConnectionPointType.STRING, "shared"],
            [NodeAssetConnectionPointType.JSON, { shared: true }],
            [NodeAssetConnectionPointType.IMAGE, image],
        ];

        for (const [type, value] of values) {
            const { asset, branchA, branchB } = CreateFanOutGraph(type, value);
            await asset.buildAsync();
            expect(branchA.captured).toBe(value);
            expect(branchB.captured).toBe(value);
        }
    });
});
