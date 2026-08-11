import { TypeLedger } from "shared-ui-components/nodeGraphSystem/typeLedger";
import { BlockNodeData } from "./blockNodeData";
import { ConnectionPointPortData } from "./connectionPointPortData";
import { type NodeAssetConnectionPoint } from "node-assets/connection/nodeAssetConnectionPoint";

export const RegisterTypeLedger = () => {
    TypeLedger.PortDataBuilder = (data, nodeContainer) => {
        const connectionPoint = data.portData.data as NodeAssetConnectionPoint;
        return new ConnectionPointPortData(connectionPoint, nodeContainer);
    };

    TypeLedger.NodeDataBuilder = (data, nodeContainer) => {
        return new BlockNodeData(data, nodeContainer);
    };
};
