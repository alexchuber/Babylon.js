import { type StateManager } from "shared-ui-components/nodeGraphSystem/stateManager";

export const RegisterExportData = (stateManager: StateManager) => {
    stateManager.exportData = (_data, _frame) => {
        // NAE serialization is handled by NodeAssetGraphController.serialize()
        // Return empty string; actual export is triggered through the controller
        return "";
    };

    stateManager.getEditorDataMap = () => {
        return {};
    };
};
