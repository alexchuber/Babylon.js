import { describe, expect, it } from "vitest";

import { NodeAsset } from "node-assets/nodeAsset";
import { NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "node-assets/connection/nodeAssetConnectionPointType";

import { type IGraphNode, type IGraphWire } from "../../src/nodeGraph/graphModel";
import { NodeIdForBlock, PointToPort, PortIdForPoint } from "../../src/nodeAssets/blockNodeMapping";
import { NodeAssetReconciler, type IReconcilableGraph } from "../../src/nodeAssets/nodeAssetReconciler";

/** A minimal block with one SCENE input and one SCENE output, enough to exercise wiring. */
class TestBlock extends NodeAssetBlock {
    public static override ClassName = "ReconcilerTestBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.SCENE);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public override async _buildBlockAsync(): Promise<void> {}
}

/** A minimal NUMBER block for exercising cross-kind compatibility. */
class NumberBlock extends NodeAssetBlock {
    public static override ClassName = "ReconcilerNumberBlock";

    public readonly input = this._registerInput("input", NodeAssetConnectionPointType.NUMBER);
    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.NUMBER);

    public override async _buildBlockAsync(): Promise<void> {}
}

/** A block whose input arity can grow at runtime, mirroring a variadic block like MergeScenes. */
class VariadicBlock extends NodeAssetBlock {
    public static override ClassName = "ReconcilerVariadicBlock";

    public readonly output = this._registerOutput("output", NodeAssetConnectionPointType.SCENE);

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.addInput();
    }

    /** Adds another SCENE input, returning it. */
    public addInput(): NodeAssetConnectionPoint {
        return this._registerInput(`input${this.inputs.length}`, NodeAssetConnectionPointType.SCENE);
    }
}

/** Builds the visual node for a block the way the controller/mapping does, so ids line up. */
function MakeNode(block: NodeAssetBlock): IGraphNode {
    return {
        id: NodeIdForBlock(block),
        title: block.name,
        headerColor: "#000000",
        position: { x: 0, y: 0 },
        collapsed: false,
        ports: [...block.inputs, ...block.outputs].map((point) => PointToPort(block, point)),
    };
}

/** Wires one block's output to another block's (first) input. */
function WireOutputToInput(from: TestBlock, to: TestBlock): IGraphWire {
    return {
        id: `wire-${from.uniqueId}-${to.uniqueId}`,
        fromPortId: PortIdForPoint(from, from.output),
        toPortId: PortIdForPoint(to, to.input),
    };
}

describe("NodeAssetReconciler", () => {
    it("reports whether mapped ports carry compatible connection point types", () => {
        const asset = new NodeAsset("test");
        const scene = new TestBlock("scene", asset);
        const number = new NumberBlock("number", asset);
        const reconciler = new NodeAssetReconciler(asset);
        reconciler.registerNode(scene, MakeNode(scene));
        reconciler.registerNode(number, MakeNode(number));

        expect(reconciler.canConnectPorts(PortIdForPoint(scene, scene.output), PortIdForPoint(scene, scene.input))).toBe(true);
        expect(reconciler.canConnectPorts(PortIdForPoint(scene, scene.output), PortIdForPoint(number, number.input))).toBe(false);
        expect(reconciler.canConnectPorts("unknown-output", PortIdForPoint(number, number.input))).toBe(false);
        expect(reconciler.canConnectPorts(PortIdForPoint(scene, scene.output), "unknown-input")).toBe(false);
    });

    it("rebuilds a domain connection from a visual wire", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const sourceNode = MakeNode(source);
        const sinkNode = MakeNode(sink);
        reconciler.registerNode(source, sourceNode);
        reconciler.registerNode(sink, sinkNode);

        reconciler.reconcile({ nodes: [sourceNode, sinkNode], wires: [WireOutputToInput(source, sink)] });

        expect(sink.input.connectedPoint).toBe(source.output);
        expect(source.output.connectedPoints).toEqual([sink.input]);
    });

    it("fans one output out to multiple inputs", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [source, first, second].map(MakeNode);
        reconciler.registerNode(source, nodes[0]);
        reconciler.registerNode(first, nodes[1]);
        reconciler.registerNode(second, nodes[2]);

        reconciler.reconcile({ nodes, wires: [WireOutputToInput(source, first), WireOutputToInput(source, second)] });

        expect(source.output.connectedPoints).toEqual([first.input, second.input]);
    });

    it("disconnects a connection when its wire is removed", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [MakeNode(source), MakeNode(sink)];
        reconciler.registerNode(source, nodes[0]);
        reconciler.registerNode(sink, nodes[1]);
        reconciler.reconcile({ nodes, wires: [WireOutputToInput(source, sink)] });

        reconciler.reconcile({ nodes, wires: [] });

        expect(sink.input.isConnected).toBe(false);
        expect(source.output.isConnected).toBe(false);
    });

    it("re-targets an input when its wire is repointed to a new source", () => {
        const asset = new NodeAsset("test");
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);
        const consumer = new TestBlock("consumer", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [first, second, consumer].map(MakeNode);
        reconciler.registerNode(first, nodes[0]);
        reconciler.registerNode(second, nodes[1]);
        reconciler.registerNode(consumer, nodes[2]);
        reconciler.reconcile({ nodes, wires: [WireOutputToInput(first, consumer)] });

        reconciler.reconcile({ nodes, wires: [WireOutputToInput(second, consumer)] });

        expect(consumer.input.connectedPoint).toBe(second.output);
        expect(first.output.isConnected).toBe(false);
    });

    it("removes a block whose visual node was deleted", () => {
        const asset = new NodeAsset("test");
        const kept = new TestBlock("kept", asset);
        const removed = new TestBlock("removed", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const keptNode = MakeNode(kept);
        const removedNode = MakeNode(removed);
        reconciler.registerNode(kept, keptNode);
        reconciler.registerNode(removed, removedNode);

        reconciler.reconcile({ nodes: [keptNode], wires: [] });

        expect(asset.attachedBlocks).toEqual([kept]);
        expect(reconciler.getBlock(removedNode.id)).toBeUndefined();
        expect(reconciler.getBlock(keptNode.id)).toBe(kept);
    });

    it("disconnects surviving blocks from a removed block", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const sourceNode = MakeNode(source);
        const sinkNode = MakeNode(sink);
        reconciler.registerNode(source, sourceNode);
        reconciler.registerNode(sink, sinkNode);
        reconciler.reconcile({ nodes: [sourceNode, sinkNode], wires: [WireOutputToInput(source, sink)] });

        reconciler.reconcile({ nodes: [sourceNode], wires: [] });

        expect(asset.attachedBlocks).toEqual([source]);
        expect(source.output.isConnected).toBe(false);
    });

    it("removes every block when all nodes are gone", () => {
        const asset = new NodeAsset("test");
        const first = new TestBlock("first", asset);
        const second = new TestBlock("second", asset);
        const reconciler = new NodeAssetReconciler(asset);
        reconciler.registerNode(first, MakeNode(first));
        reconciler.registerNode(second, MakeNode(second));

        reconciler.reconcile({ nodes: [], wires: [] });

        expect(asset.attachedBlocks).toHaveLength(0);
    });

    it("ignores wires whose endpoints are not mapped", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [MakeNode(source), MakeNode(sink)];
        reconciler.registerNode(source, nodes[0]);
        reconciler.registerNode(sink, nodes[1]);

        reconciler.reconcile({ nodes, wires: [{ id: "ghost", fromPortId: "port-unknown-out-x", toPortId: PortIdForPoint(sink, sink.input) }] });

        expect(sink.input.isConnected).toBe(false);
    });

    it("is idempotent across repeated reconciles", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [MakeNode(source), MakeNode(sink)];
        reconciler.registerNode(source, nodes[0]);
        reconciler.registerNode(sink, nodes[1]);
        const graph: IReconcilableGraph = { nodes, wires: [WireOutputToInput(source, sink)] };

        reconciler.reconcile(graph);
        reconciler.reconcile(graph);

        expect(source.output.connectedPoints).toEqual([sink.input]);
        expect(sink.input.connectedPoint).toBe(source.output);
    });

    it("no-ops a reconcile that re-enters while already reconciling", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const sink = new TestBlock("sink", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const nodes = [MakeNode(source), MakeNode(sink)];
        reconciler.registerNode(source, nodes[0]);
        reconciler.registerNode(sink, nodes[1]);
        const wires = [WireOutputToInput(source, sink)];

        // A graph whose first `nodes` access re-enters reconcile; the guard must make that nested call a no-op.
        let accesses = 0;
        const reentrantGraph: IReconcilableGraph = {
            get nodes() {
                if (accesses++ === 0) {
                    reconciler.reconcile(reentrantGraph);
                }
                return nodes;
            },
            wires,
        };

        expect(() => reconciler.reconcile(reentrantGraph)).not.toThrow();
        expect(source.output.connectedPoints).toEqual([sink.input]);
    });

    it("grows a node's ports when its block gains an input", () => {
        const asset = new NodeAsset("test");
        const variadic = new VariadicBlock("merge", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const node = MakeNode(variadic);
        reconciler.registerNode(variadic, node);
        expect(node.ports.filter((port) => port.direction === "input")).toHaveLength(1);

        variadic.addInput();
        reconciler.reconcile({ nodes: [node], wires: [] });

        expect(node.ports.filter((port) => port.direction === "input")).toHaveLength(2);
        expect(node.ports.filter((port) => port.direction === "output")).toHaveLength(1);
    });

    it("wires to a port that appeared after a variadic grow", () => {
        const asset = new NodeAsset("test");
        const source = new TestBlock("source", asset);
        const variadic = new VariadicBlock("merge", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const sourceNode = MakeNode(source);
        const variadicNode = MakeNode(variadic);
        reconciler.registerNode(source, sourceNode);
        reconciler.registerNode(variadic, variadicNode);

        const newInput = variadic.addInput();
        const wire: IGraphWire = {
            id: "wire-to-new-input",
            fromPortId: PortIdForPoint(source, source.output),
            toPortId: PortIdForPoint(variadic, newInput),
        };
        reconciler.reconcile({ nodes: [sourceNode, variadicNode], wires: [wire] });

        expect(newInput.connectedPoint).toBe(source.output);
    });

    it("leaves a fixed-arity node's ports matching its block", () => {
        const asset = new NodeAsset("test");
        const block = new TestBlock("fixed", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const node = MakeNode(block);
        reconciler.registerNode(block, node);

        reconciler.reconcile({ nodes: [node], wires: [] });

        expect(node.ports.map((port) => port.id)).toEqual([PortIdForPoint(block, block.input), PortIdForPoint(block, block.output)]);
    });

    it("reset clears correspondence and retargets a new asset", () => {
        const asset = new NodeAsset("test");
        const oldBlock = new TestBlock("old", asset);
        const reconciler = new NodeAssetReconciler(asset);
        const oldNode = MakeNode(oldBlock);
        reconciler.registerNode(oldBlock, oldNode);

        const nextAsset = new NodeAsset("next");
        const nextBlock = new TestBlock("next", nextAsset);
        reconciler.reset(nextAsset);

        expect(reconciler.getBlock(oldNode.id)).toBeUndefined();

        // Reconciling with the old node must not remove blocks from the new asset (its map is empty).
        reconciler.reconcile({ nodes: [oldNode], wires: [] });
        expect(nextAsset.attachedBlocks).toEqual([nextBlock]);
    });

    it("getBlock returns undefined for an unknown node", () => {
        const asset = new NodeAsset("test");
        const reconciler = new NodeAssetReconciler(asset);

        expect(reconciler.getBlock("node-does-not-exist")).toBeUndefined();
    });
});
