import { DisplayLedger } from "shared-ui-components/nodeGraphSystem/displayLedger";
import { NodeAssetDefaultDisplayManager } from "./display/nodeAssetDefaultDisplayManager";
import { GetAllBlockDescriptors } from "../nodeAssets/blockCatalog";

export const RegisterToDisplayManagers = () => {
    // Register the default display manager for every known NAE block class name.
    for (const descriptor of GetAllBlockDescriptors()) {
        if (!DisplayLedger.RegisteredControls[descriptor.className]) {
            DisplayLedger.RegisteredControls[descriptor.className] = NodeAssetDefaultDisplayManager;
        }
    }
};
