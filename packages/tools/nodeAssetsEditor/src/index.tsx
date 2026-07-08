import { MakeModularTool } from "shared-ui-components/modularTool/modularTool";

import { NodeAssetsEditorServiceDefinition } from "./services/nodeAssetsEditorService";

MakeModularTool({
    namespace: "NodeAssetsEditor",
    containerElement: document.getElementById("root")!,
    serviceDefinitions: [NodeAssetsEditorServiceDefinition],
    toolbarMode: "compact",
    showThemeSelector: true,
    leftPaneDefaultWidth: 300,
    rightPaneDefaultWidth: 400,
    rightPaneMinWidth: 300,
});
