/**
 * Bridges the existing NodeAssetGraphController (which speaks the custom model types) into the
 * shared node graph system. Rather than rewriting the entire controller (1,100 LOC of carefully
 * crafted domain logic including aggregates, reconciliation, and serialization), this bridge
 * observes the existing controller's state and projects it into the shared GraphCanvasComponent.
 *
 * This is an incremental integration strategy: the controller continues to own the NodeAsset domain
 * model and its reconciler, and this bridge translates its visual model (IGraphNode/IGraphWire/IGraphFrame)
 * into shared-system GraphNode/NodeLink/GraphFrame instances.
 */

import { type Nullable } from "core/types";
import { type IObserver } from "core/Misc/observable";

import { type GraphCanvasComponent } from "shared-ui-components/nodeGraphSystem/graphCanvas";
import { type GraphNode } from "shared-ui-components/nodeGraphSystem/graphNode";

import { type GlobalState } from "../globalState";
import { type NodeAssetGraphController } from "./nodeAssetGraphController";
import { BlockNodeData } from "../graphSystem/blockNodeData";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

/**
 * Projects the NodeAssetGraphController's state into a shared GraphCanvasComponent.
 * Call {@link attach} after the canvas is mounted and {@link detach} before unmount.
 */
export class SharedGraphBridge {
    private _controller: NodeAssetGraphController;
    private _globalState: GlobalState;
    private _canvas: Nullable<GraphCanvasComponent> = null;
    private _changeObserver: Nullable<IObserver> = null;

    public constructor(controller: NodeAssetGraphController, globalState: GlobalState) {
        this._controller = controller;
        this._globalState = globalState;
        this._globalState.nodeAsset = (controller as any)._nodeAsset;
    }

    /** The underlying controller. */
    public get controller(): NodeAssetGraphController {
        return this._controller;
    }

    /**
     * Attaches to a mounted GraphCanvasComponent, projecting the current controller state
     * and subscribing to future changes.
     * @param canvas - The mounted canvas component.
     */
    public attach(canvas: GraphCanvasComponent): void {
        this._canvas = canvas;
        this._projectFullState();

        // Subscribe to controller state changes and re-project
        this._changeObserver = this._controller.state.onChanged.add(() => {
            this._projectFullState();
        });
    }

    /**
     * Detaches from the canvas, stopping further projections.
     */
    public detach(): void {
        if (this._changeObserver) {
            this._changeObserver.remove();
            this._changeObserver = null;
        }
        this._canvas = null;
    }

    /**
     * Creates a block from a palette item and adds it to both the controller and the canvas.
     * @param paletteItemId - The dropped palette item id.
     * @param position - The graph-space drop position.
     * @returns The created GraphNode, or null if creation failed.
     */
    public createNodeFromPaletteItem(paletteItemId: string, position: { x: number; y: number }): Nullable<GraphNode> {
        const node = this._controller.createNodeFromPaletteItem(paletteItemId, position);
        this._controller.state.addNode(node);
        // The state change observer will re-project; but we return the GraphNode for immediate positioning
        return this._canvas ? this._findGraphNodeForBlockNodeId(node.id) : null;
    }

    /**
     * Full re-project: clears the canvas and rebuilds all nodes from the controller state.
     * This is brute-force but correct; performance can be optimized later with diffing.
     */
    private _projectFullState(): void {
        const canvas = this._canvas;
        if (!canvas) {
            return;
        }

        // Clear current canvas state
        canvas.reset();

        // Project all nodes
        const controllerState = this._controller.state;
        for (const visualNode of controllerState.nodes) {
            const block = (this._controller as any)._reconciler.getBlock(visualNode.id) as Nullable<NodeAssetBlock>;
            if (!block) {
                continue;
            }

            const nodeData = new BlockNodeData(block, canvas);
            const graphNode = canvas.createNodeFromObject(nodeData, () => {
                // Block already registered with NodeAsset
            });

            // Apply position from the controller's visual model
            graphNode.x = visualNode.position.x;
            graphNode.y = visualNode.position.y;
            graphNode.cleanAccumulation();
        }

        // Project all wires as links
        for (const wire of controllerState.wires) {
            const fromNode = this._findGraphNodeForPort(wire.fromPortId);
            const toNode = this._findGraphNodeForPort(wire.toPortId);
            if (fromNode && toNode) {
                const fromPort = this._findNodePort(fromNode, wire.fromPortId);
                const toPort = this._findNodePort(toNode, wire.toPortId);
                if (fromPort && toPort) {
                    canvas.connectPorts(fromPort, toPort);
                }
            }
        }

        // Frames would be projected here once the shared system's frame API is wired
    }

    private _findGraphNodeForBlockNodeId(nodeId: string): Nullable<GraphNode> {
        if (!this._canvas) {
            return null;
        }
        const block = (this._controller as any)._reconciler.getBlock(nodeId) as Nullable<NodeAssetBlock>;
        if (!block) {
            return null;
        }
        return this._canvas.nodes.find((n) => n.content.data === block) ?? null;
    }

    private _findGraphNodeForPort(portId: string): Nullable<GraphNode> {
        if (!this._canvas) {
            return null;
        }
        // Port ids encode the block id: "port-{blockId}-{direction}-{name}"
        const match = portId.match(/^port-(\d+)-(in|out)-(.+)$/);
        if (!match) {
            return null;
        }
        const blockId = parseInt(match[1], 10);
        return this._canvas.nodes.find((n) => (n.content.data as NodeAssetBlock)?.uniqueId === blockId) ?? null;
    }

    private _findNodePort(graphNode: GraphNode, portId: string): any {
        // Port ids encode: "port-{blockId}-{direction}-{name}"
        const match = portId.match(/^port-(\d+)-(in|out)-(.+)$/);
        if (!match) {
            return null;
        }
        const direction = match[2];
        const name = match[3];
        const block = graphNode.content.data as NodeAssetBlock;

        if (direction === "in") {
            const point = block.inputs.find((p) => p.name === name);
            if (!point) {
                return null;
            }
            const portData = graphNode.getPortDataForPortDataContent(point);
            return portData ? graphNode.getPortForPortData(portData) : null;
        }
        const point = block.outputs.find((p) => p.name === name);
        if (!point) {
            return null;
        }
        const portData = graphNode.getPortDataForPortDataContent(point);
        return portData ? graphNode.getPortForPortData(portData) : null;
    }
}
