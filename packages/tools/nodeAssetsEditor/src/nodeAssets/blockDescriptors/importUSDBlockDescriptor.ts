import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the USD import boundary block (shared with the other Sources).
const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-usd",
    label: "Import USD",
    category: "Sources",
    headerColor: ImportHeaderColor,
    className: ImportUSDBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportUSDBlock("Import USD", nodeAsset)),
});
