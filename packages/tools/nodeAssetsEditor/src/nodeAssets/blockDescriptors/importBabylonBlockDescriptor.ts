import { ImportBabylonBlock } from "node-assets/Blocks/importBabylonBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the Babylon import block.
const ImportHeaderColor = "#3f6fd9";

RegisterBlockDescriptor({
    paletteItemId: "import-babylon",
    label: "Import Babylon",
    category: "Sources",
    headerColor: ImportHeaderColor,
    className: ImportBabylonBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonBlock("Import Babylon", nodeAsset)),
});
