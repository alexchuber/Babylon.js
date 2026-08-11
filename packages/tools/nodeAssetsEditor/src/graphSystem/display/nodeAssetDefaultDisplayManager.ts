import { type IDisplayManager } from "shared-ui-components/nodeGraphSystem/interfaces/displayManager";
import { type INodeData } from "shared-ui-components/nodeGraphSystem/interfaces/nodeData";
import { type IPortData } from "shared-ui-components/nodeGraphSystem/interfaces/portData";
import { GetBlockBodyColor } from "../blockTypeColors";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

/**
 * Default display manager for NodeAsset blocks. Colors the node based on the block's
 * descriptor header color, matching the prior custom canvas appearance.
 */
export class NodeAssetDefaultDisplayManager implements IDisplayManager {
    public getHeaderClass(_data: INodeData): string {
        return "";
    }

    public shouldDisplayPortLabels(_data: IPortData): boolean {
        return true;
    }

    public getHeaderText(data: INodeData): string {
        return data.name;
    }

    public getBackgroundColor(data: INodeData): string {
        return GetBlockBodyColor(data.data as NodeAssetBlock);
    }

    public updatePreviewContent(_data: INodeData, _contentArea: HTMLDivElement): void {
        // No preview content for NAE blocks
    }
}
