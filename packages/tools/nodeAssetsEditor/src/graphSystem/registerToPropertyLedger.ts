import { PropertyLedger } from "shared-ui-components/nodeGraphSystem/propertyLedger";
import { GenericNodePropertyComponent } from "./properties/genericNodePropertyComponent";

export const RegisterToPropertyTabManagers = () => {
    PropertyLedger.DefaultControl = GenericNodePropertyComponent;
    // Block-specific overrides can be added here as needed:
    // PropertyLedger.RegisteredControls["ClassName"] = SpecificComponent;
};
