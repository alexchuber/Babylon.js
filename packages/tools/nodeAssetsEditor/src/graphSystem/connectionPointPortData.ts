import { type Nullable } from "core/types";
import { type INodeContainer } from "shared-ui-components/nodeGraphSystem/interfaces/nodeContainer";
import { type IPortData, PortDataDirection } from "shared-ui-components/nodeGraphSystem/interfaces/portData";
import { type GraphNode } from "shared-ui-components/nodeGraphSystem/graphNode";
import { type NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointDirection } from "node-assets/connection/nodeAssetConnectionPointDirection";
import { NodeAssetConnectionPointType } from "node-assets/connection/nodeAssetConnectionPointType";

/**
 * Adapts a NodeAssetConnectionPoint to the IPortData interface used by the shared graph canvas.
 */
export class ConnectionPointPortData implements IPortData {
    private _connectedPort: Nullable<IPortData> = null;
    private _nodeContainer: INodeContainer;

    public data: NodeAssetConnectionPoint;

    public get name() {
        return this.data.name;
    }

    public get internalName() {
        return this.data.name;
    }

    private _isExposedOnFrame = false;
    private _exposedPortPosition = -1;

    public get isExposedOnFrame() {
        return this._isExposedOnFrame;
    }

    public set isExposedOnFrame(value: boolean) {
        this._isExposedOnFrame = value;
    }

    public get exposedPortPosition() {
        return this._exposedPortPosition;
    }

    public set exposedPortPosition(value: number) {
        this._exposedPortPosition = value;
    }

    public get isConnected() {
        return this.data.isConnected;
    }

    public get isInactive() {
        return false;
    }

    public get connectedPort() {
        if (!this.isConnected) {
            return null;
        }
        if (!this._connectedPort) {
            // For inputs: connectedPoint is the single source output
            if (this.data.direction === NodeAssetConnectionPointDirection.Input && this.data.connectedPoint) {
                const otherBlock = this.data.connectedPoint.ownerBlock;
                const otherNode = this._nodeContainer.nodes.find((n) => n.content.data === otherBlock);
                if (otherNode) {
                    this._connectedPort = otherNode.getPortDataForPortDataContent(this.data.connectedPoint);
                }
            }
            // For outputs: use first connected point
            if (this.data.direction === NodeAssetConnectionPointDirection.Output && this.data.connectedPoints.length > 0) {
                const otherBlock = this.data.connectedPoints[0].ownerBlock;
                const otherNode = this._nodeContainer.nodes.find((n) => n.content.data === otherBlock);
                if (otherNode) {
                    this._connectedPort = otherNode.getPortDataForPortDataContent(this.data.connectedPoints[0]);
                }
            }
        }
        return this._connectedPort;
    }

    public set connectedPort(value: Nullable<IPortData>) {
        this._connectedPort = value;
    }

    public get direction() {
        return this.data.direction === NodeAssetConnectionPointDirection.Input ? PortDataDirection.Input : PortDataDirection.Output;
    }

    public get ownerData() {
        return this.data.ownerBlock;
    }

    public get needDualDirectionValidation() {
        return false;
    }

    public get hasEndpoints() {
        if (this.data.direction === NodeAssetConnectionPointDirection.Output) {
            return this.data.connectedPoints.length > 0;
        }
        return this.data.connectedPoint !== null;
    }

    public get endpoints() {
        const endpoints: IPortData[] = [];
        if (this.data.direction === NodeAssetConnectionPointDirection.Output) {
            for (const target of this.data.connectedPoints) {
                const otherNode = this._nodeContainer.nodes.find((n) => n.content.data === target.ownerBlock);
                if (otherNode) {
                    const portData = otherNode.getPortDataForPortDataContent(target);
                    if (portData) {
                        endpoints.push(portData);
                    }
                }
            }
        } else if (this.data.connectedPoint) {
            const otherNode = this._nodeContainer.nodes.find((n) => n.content.data === this.data.connectedPoint!.ownerBlock);
            if (otherNode) {
                const portData = otherNode.getPortDataForPortDataContent(this.data.connectedPoint);
                if (portData) {
                    endpoints.push(portData);
                }
            }
        }
        return endpoints;
    }

    public constructor(connectionPoint: NodeAssetConnectionPoint, nodeContainer: INodeContainer) {
        this.data = connectionPoint;
        this._nodeContainer = nodeContainer;
    }

    public updateDisplayName(_newName: string) {
        // NodeAsset connection points have fixed names
    }

    public connectTo(port: IPortData) {
        const other = port as ConnectionPointPortData;
        this.data.connectTo(other.data);
        this._connectedPort = port;
    }

    public canConnectTo(port: IPortData): boolean {
        const other = port as ConnectionPointPortData;
        // Must be opposite directions
        if (this.direction === other.direction) {
            return false;
        }
        // Must be same connection point type
        if (this.data.type !== other.data.type) {
            return false;
        }
        return true;
    }

    public disconnectFrom(port: IPortData) {
        // Disconnecting clears this point's connection
        this.data.disconnect();
        port.connectedPort = null;
        this._connectedPort = null;
    }

    public checkCompatibilityState(port: IPortData) {
        if (!this.canConnectTo(port)) {
            return 1;
        }
        return 0;
    }

    public getCompatibilityIssueMessage(issue: number, _targetNode: GraphNode, _targetPort: IPortData) {
        switch (issue) {
            case 1: {
                const other = _targetPort as ConnectionPointPortData;
                if (this.direction === other.direction) {
                    return "Cannot connect ports of the same direction";
                }
                return `Incompatible types: ${NodeAssetConnectionPointType[this.data.type]} and ${NodeAssetConnectionPointType[other.data.type]}`;
            }
            default:
                return "";
        }
    }
}
