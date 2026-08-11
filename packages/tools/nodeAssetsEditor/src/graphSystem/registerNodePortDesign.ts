import { type StateManager } from "shared-ui-components/nodeGraphSystem/stateManager";
import { type IPortData } from "shared-ui-components/nodeGraphSystem/interfaces/portData";
import { type ConnectionPointPortData } from "./connectionPointPortData";
import { NodeAssetConnectionPointType } from "node-assets/connection/nodeAssetConnectionPointType";
import {
    ScenePortColor,
    NumberPortColor,
    StringPortColor,
    JsonPortColor,
    ImagePortColor,
    UsdStagePortColor,
    BabylonScenePortColor,
    NodeGeometryPortColor,
    UniversalPortColor,
    OBJPortColor,
    FBXHeaderColor,
} from "../nodeAssets/blockCatalog";

/** Solid circle SVG (base64) — default port icon */
const _SvgCircle =
    "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMSAyMSI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiNmZmY7fTwvc3R5bGU+PC9kZWZzPjx0aXRsZT5WZWN0b3IxPC90aXRsZT48ZyBpZD0iTGF5ZXJfNSIgZGF0YS1uYW1lPSJMYXllciA1Ij48Y2lyY2xlIGNsYXNzPSJjbHMtMSIgY3g9IjEwLjUiIGN5PSIxMC41IiByPSI3LjUiLz48L2c+PC9zdmc+";

/**
 * Maps connection point type to its port dot color.
 * @param type - The connection point type.
 * @returns The port color string.
 */
function _GetPortColor(type: NodeAssetConnectionPointType): string {
    switch (type) {
        case NodeAssetConnectionPointType.GLTF_DOCUMENT:
            return ScenePortColor;
        case NodeAssetConnectionPointType.NUMBER:
            return NumberPortColor;
        case NodeAssetConnectionPointType.STRING:
            return StringPortColor;
        case NodeAssetConnectionPointType.JSON:
            return JsonPortColor;
        case NodeAssetConnectionPointType.IMAGE:
            return ImagePortColor;
        case NodeAssetConnectionPointType.USD_STAGE:
        case NodeAssetConnectionPointType.USD_SOURCE:
            return UsdStagePortColor;
        case NodeAssetConnectionPointType.BABYLON_SCENE:
        case NodeAssetConnectionPointType.BABYLON_SOURCE:
            return BabylonScenePortColor;
        case NodeAssetConnectionPointType.NODE_GEOMETRY:
            return NodeGeometryPortColor;
        case NodeAssetConnectionPointType.UNIVERSAL:
            return UniversalPortColor;
        case NodeAssetConnectionPointType.OBJ_SOURCE:
            return OBJPortColor;
        case NodeAssetConnectionPointType.FBX_SOURCE:
            return FBXHeaderColor;
        default:
            return "#888888";
    }
}

export const RegisterNodePortDesign = (stateManager: StateManager) => {
    stateManager.getPortColor = (portData: IPortData) => {
        const cpd = portData as ConnectionPointPortData;
        return _GetPortColor(cpd.data.type);
    };

    stateManager.applyNodePortDesign = (portData: IPortData, element: HTMLElement, imgHost: HTMLImageElement, _pip: HTMLDivElement) => {
        const cpd = portData as ConnectionPointPortData;
        const color = _GetPortColor(cpd.data.type);
        element.style.background = color;
        imgHost.src = "data:image/svg+xml;base64," + _SvgCircle;
        imgHost.style.width = "100%";
        imgHost.style.height = "100%";
        return false;
    };
};
