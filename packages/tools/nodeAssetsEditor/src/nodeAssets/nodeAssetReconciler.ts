/**
 * Keeps a live {@link NodeAsset} (the source of truth) in sync with the visual graph that renders it.
 *
 * The controller creates blocks up front (palette drops and load) and hands each block/node pair to
 * {@link registerNode}, so this reconciler only ever needs to remove and re-wire, never add. It owns
 * the two correspondence maps — node id -> block and port id -> connection point — and performs a
 * one-directional (visual -> domain) reconcile: blocks whose visual node was deleted are removed,
 * variadic nodes grow/shrink their ports to match their block, and connections are rebuilt from the
 * visual wires.
 *
 * It depends only on the runtime graph and a read-only view of the visual nodes/wires, never on React
 * or the editor shell, so it is directly unit-testable. All NodeAssets/gltf-transform types are
 * confined to this app layer; the framework never imports it.
 */

import { type NodeAsset } from "node-assets/nodeAsset";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";

import { type IGraphNode, type IGraphPort, type IGraphWire } from "../nodeGraph/graphModel";
import { PointToPort, PortIdForPoint } from "./blockNodeMapping";

/** The read-only view of the visual graph a reconcile needs; {@link GraphEditorState} satisfies it. */
export interface IReconcilableGraph {
    readonly nodes: readonly IGraphNode[];
    readonly wires: readonly IGraphWire[];
}

/**
 * Owns the visual-to-domain correspondence for a {@link NodeAsset} and reconciles the domain graph
 * onto the current visuals.
 */
export class NodeAssetReconciler {
    private _nodeAsset: NodeAsset;
    private readonly _blockByNodeId = new Map<string, NodeAssetBlock>();
    private readonly _pointByPortId = new Map<string, NodeAssetConnectionPoint>();
    private _reconciling = false;

    /**
     * @param nodeAsset - The domain graph to keep in sync.
     */
    public constructor(nodeAsset: NodeAsset) {
        this._nodeAsset = nodeAsset;
    }

    /**
     * Records the correspondence between a block and its visual node, mapping every connection point
     * to its port id. Call this as each block is created, before the block's node reaches the graph.
     * @param block - The backing block.
     * @param node - Its visual node.
     */
    public registerNode(block: NodeAssetBlock, node: IGraphNode): void {
        this._blockByNodeId.set(node.id, block);
        for (const input of block.inputs) {
            this._pointByPortId.set(PortIdForPoint(block, input), input);
        }
        for (const output of block.outputs) {
            this._pointByPortId.set(PortIdForPoint(block, output), output);
        }
    }

    /**
     * The block backing a visual node, if any.
     * @param nodeId - The visual node id.
     * @returns The backing block, or undefined if the node is unknown.
     */
    public getBlock(nodeId: string): NodeAssetBlock | undefined {
        return this._blockByNodeId.get(nodeId);
    }

    /**
     * Whether two visual ports map to connection points carrying the same payload kind.
     * @param fromPortId - The candidate output port id.
     * @param toPortId - The candidate input port id.
     * @returns True when both ports are mapped and their connection point types match.
     */
    public canConnectPorts(fromPortId: string, toPortId: string): boolean {
        const from = this._pointByPortId.get(fromPortId);
        const to = this._pointByPortId.get(toPortId);
        return from !== undefined && to !== undefined && from.type === to.type;
    }

    /**
     * Clears every correspondence and retargets a new domain graph, for a fresh load.
     * @param nodeAsset - The new domain graph.
     */
    public reset(nodeAsset: NodeAsset): void {
        this._nodeAsset = nodeAsset;
        this._blockByNodeId.clear();
        this._pointByPortId.clear();
    }

    /**
     * Reconciles the domain graph onto the given visuals: removes blocks whose node was deleted, syncs
     * variadic node ports, then rebuilds all connections from the visual wires. Idempotent and guarded
     * against re-entrancy.
     * @param graph - The current visual nodes and wires.
     */
    public reconcile(graph: IReconcilableGraph): void {
        if (this._reconciling) {
            return;
        }
        this._reconciling = true;
        try {
            // 1) Remove domain blocks whose visual node no longer exists.
            const liveNodeIds = new Set(graph.nodes.map((node) => node.id));
            for (const [nodeId, block] of Array.from(this._blockByNodeId)) {
                if (!liveNodeIds.has(nodeId)) {
                    this._nodeAsset.removeBlock(block);
                    this._blockByNodeId.delete(nodeId);
                    for (const input of block.inputs) {
                        this._pointByPortId.delete(PortIdForPoint(block, input));
                    }
                    for (const output of block.outputs) {
                        this._pointByPortId.delete(PortIdForPoint(block, output));
                    }
                }
            }

            // 2) Sync each surviving node's visual ports to its block's connection points. This is a
            //    no-op for fixed-arity blocks and is what lets a variadic block (MergeScenes) grow: when
            //    its backing block gains an input, the node gains the matching port and it becomes wirable.
            this._syncNodePortsToBlocks(graph);

            // 3) Rebuild all connections from the visual wires. Clearing outputs clears both sides.
            for (const block of this._nodeAsset.attachedBlocks) {
                for (const output of block.outputs) {
                    output.disconnect();
                }
            }
            for (const wire of graph.wires) {
                const from = this._pointByPortId.get(wire.fromPortId);
                const to = this._pointByPortId.get(wire.toPortId);
                if (from && to) {
                    from.connectTo(to);
                }
            }
        } finally {
            this._reconciling = false;
        }
    }

    /**
     * Rebuilds any node whose visual ports no longer match its block's connection points, keeping the
     * port-to-point map in step. Only variadic blocks whose input set changed do any work here; every
     * fixed-arity node short-circuits on the id comparison. Ports are typed read-only for framework
     * consumers, but this reconciler owns the visual-to-domain bridge, so it replaces the port list in
     * place (mirroring how the controller mutates other node fields before `notifyChanged`).
     * @param graph - The current visual nodes.
     */
    private _syncNodePortsToBlocks(graph: IReconcilableGraph): void {
        for (const node of graph.nodes) {
            const block = this._blockByNodeId.get(node.id);
            if (!block) {
                continue;
            }

            const desiredPorts: IGraphPort[] = [];
            for (const input of block.inputs) {
                desiredPorts.push(PointToPort(block, input));
            }
            for (const output of block.outputs) {
                desiredPorts.push(PointToPort(block, output));
            }

            if (node.ports.length === desiredPorts.length && node.ports.every((port, index) => port.id === desiredPorts[index].id)) {
                continue;
            }

            for (const port of node.ports) {
                this._pointByPortId.delete(port.id);
            }
            (node as { ports: readonly IGraphPort[] }).ports = desiredPorts;
            for (const input of block.inputs) {
                this._pointByPortId.set(PortIdForPoint(block, input), input);
            }
            for (const output of block.outputs) {
                this._pointByPortId.set(PortIdForPoint(block, output), output);
            }
        }
    }
}
