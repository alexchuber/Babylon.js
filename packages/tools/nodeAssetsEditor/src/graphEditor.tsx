import * as React from "react";
import { type Nullable } from "core/types";
import { type Observer } from "core/Misc/observable";

import { GraphCanvasComponent } from "shared-ui-components/nodeGraphSystem/graphCanvas";
import { type GraphNode } from "shared-ui-components/nodeGraphSystem/graphNode";
import { TypeLedger } from "shared-ui-components/nodeGraphSystem/typeLedger";
import { type INodeData } from "shared-ui-components/nodeGraphSystem/interfaces/nodeData";

import { type GlobalState } from "./globalState";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type BlockNodeData } from "./graphSystem/blockNodeData";
import { NaeDragMime } from "./components/nodeList/draggableLine";
import { GetBlockDescriptorByPaletteItemId } from "./nodeAssets/blockCatalog";
import { type SharedGraphBridge } from "./nodeAssets/sharedGraphBridge";

import "./main.scss";

interface IGraphEditorProps {
    globalState: GlobalState;
    bridge?: SharedGraphBridge;
}

interface IGraphEditorState {
    // Reserved for future state
}

export class GraphEditor extends React.Component<IGraphEditorProps, IGraphEditorState> {
    private _graphCanvasRef: React.RefObject<GraphCanvasComponent>;
    private _diagramContainerRef: React.RefObject<HTMLDivElement>;
    private _graphCanvas: GraphCanvasComponent;

    private _onResetObserver: Nullable<Observer<boolean>>;
    private _onZoomToFitObserver: Nullable<Observer<void>>;

    constructor(props: IGraphEditorProps) {
        super(props);
        this._graphCanvasRef = React.createRef();
        this._diagramContainerRef = React.createRef();
    }

    override componentDidMount() {
        this._graphCanvas = this._graphCanvasRef.current!;

        // Attach bridge if provided (projects controller state into shared canvas)
        if (this.props.bridge) {
            this.props.bridge.attach(this._graphCanvas);
        }

        this._onResetObserver = this.props.globalState.onResetRequiredObservable.add(() => {
            this._graphCanvas.reset();
        });

        this._onZoomToFitObserver = this.props.globalState.onZoomToFitRequiredObservable.add(() => {
            this._graphCanvas.zoomToFit();
        });
    }

    override componentWillUnmount() {
        if (this.props.bridge) {
            this.props.bridge.detach();
        }
        this.props.globalState.onResetRequiredObservable.remove(this._onResetObserver);
        this.props.globalState.onZoomToFitRequiredObservable.remove(this._onZoomToFitObserver);
    }

    /**
     * Creates a GraphNode from a NodeAssetBlock and adds it to the canvas.
     * @param block - The block to visualize.
     * @param position - Optional position override.
     * @returns The created GraphNode.
     */
    public appendBlock(block: NodeAssetBlock, position?: { x: number; y: number }): GraphNode {
        const nodeData = TypeLedger.NodeDataBuilder(block, this._graphCanvas) as BlockNodeData;
        const node = this._graphCanvas.createNodeFromObject(nodeData, () => {
            // Registration callback — blocks are already registered with their NodeAsset
        });

        if (position) {
            node.x = position.x;
            node.y = position.y;
            node.cleanAccumulation();
        }

        return node;
    }

    /**
     * Gets the GraphNode for a given block.
     * @param block - The block to look up.
     * @returns The GraphNode or null.
     */
    public getNodeFromBlock(block: NodeAssetBlock): Nullable<GraphNode> {
        return this._graphCanvas.nodes.find((n) => n.content.data === block) ?? null;
    }

    private _onDragOver = (evt: React.DragEvent<HTMLDivElement>) => {
        evt.preventDefault();
    };

    private _handleDrop = (evt: React.DragEvent<HTMLDivElement>) => {
        evt.preventDefault();
        const paletteItemId = evt.nativeEvent.dataTransfer?.getData(NaeDragMime);
        if (!paletteItemId) {
            this.props.globalState.onDropEventReceivedObservable.notifyObservers(evt.nativeEvent);
            return;
        }

        const descriptor = GetBlockDescriptorByPaletteItemId(paletteItemId);
        const nodeAsset = this.props.globalState.nodeAsset;
        if (!descriptor || !nodeAsset) {
            return;
        }

        const block = descriptor.create(nodeAsset);
        const canvasContainer = this._graphCanvas?.canvasContainer;
        if (!canvasContainer) {
            return;
        }
        const rect = canvasContainer.getBoundingClientRect();
        const dropX = (evt.clientX - rect.left) / this._graphCanvas.zoom;
        const dropY = (evt.clientY - rect.top) / this._graphCanvas.zoom;

        const node = this.appendBlock(block, { x: dropX, y: dropY });
        this._graphCanvas.drop(node, evt.clientX - rect.left, evt.clientY - rect.top, 0, 0);
    };

    private _onEmitNewNode = (nodeData: INodeData): GraphNode => {
        return this._graphCanvas.createNodeFromObject(nodeData, () => {
            // Block is already registered with NodeAsset at creation time
        });
    };

    override render() {
        return (
            <div id="node-assets-editor-graph-root" className="diagram-container" ref={this._diagramContainerRef} onDragOver={this._onDragOver} onDrop={this._handleDrop}>
                <GraphCanvasComponent ref={this._graphCanvasRef} stateManager={this.props.globalState.stateManager} enableMinimap={true} onEmitNewNode={this._onEmitNewNode} />
            </div>
        );
    }
}
