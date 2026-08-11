import { type INodeContainer } from "shared-ui-components/nodeGraphSystem/interfaces/nodeContainer";
import { type INodeData } from "shared-ui-components/nodeGraphSystem/interfaces/nodeData";
import { type IPortData } from "shared-ui-components/nodeGraphSystem/interfaces/portData";
import { ConnectionPointPortData } from "./connectionPointPortData";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

/**
 * Adapts a NodeAssetBlock to the INodeData interface used by the shared graph canvas.
 */
export class BlockNodeData implements INodeData {
    private _inputs: IPortData[] = [];
    private _outputs: IPortData[] = [];

    public refreshCallback?: () => void;

    public get uniqueId(): number {
        return this.data.uniqueId;
    }

    public get name() {
        return this.data.name;
    }

    public set name(value: string) {
        this.data.name = value;
    }

    public getClassName() {
        return this.data.getClassName();
    }

    public get isInput() {
        return this.data.inputs.length === 0;
    }

    public get inputs() {
        return this._inputs;
    }

    public get outputs() {
        return this._outputs;
    }

    public get comments() {
        return "";
    }

    public set comments(_value: string) {
        // NodeAssetBlocks don't support comments currently
    }

    public getPortByName(name: string) {
        for (const input of this._inputs) {
            if (input.internalName === name) {
                return input;
            }
        }
        for (const output of this._outputs) {
            if (output.internalName === name) {
                return output;
            }
        }
        return null;
    }

    public isConnectedToOutput() {
        return true;
    }

    public dispose() {
        // NodeAssetBlocks are owned by NodeAsset; disposal is handled at that level
    }

    public prepareHeaderIcon(iconDiv: HTMLDivElement, _img: HTMLImageElement) {
        iconDiv.style.display = "none";
    }

    public get invisibleEndpoints() {
        return null;
    }

    public nodeContainer: INodeContainer;

    public constructor(
        public data: NodeAssetBlock,
        nodeContainer: INodeContainer
    ) {
        this.nodeContainer = nodeContainer;

        for (const input of data.inputs) {
            this._inputs.push(new ConnectionPointPortData(input, nodeContainer));
        }

        for (const output of data.outputs) {
            this._outputs.push(new ConnectionPointPortData(output, nodeContainer));
        }
    }
}
