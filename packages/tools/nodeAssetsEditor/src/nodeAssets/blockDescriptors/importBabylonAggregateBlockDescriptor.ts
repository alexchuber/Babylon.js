import { ImportBabylonAggregateBlock } from "node-assets/Blocks/importBabylonAggregateBlock";

import { BabylonHeaderColor, ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-babylon",
    label: "Import Babylon",
    description: "Read a .babylon source and cross into Universal.",
    keywords: ["open", "load", "source", "babylon", "Universal"],
    category: "Inputs",
    headerColor: BabylonHeaderColor,
    className: ImportBabylonAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonAggregateBlock("Import Babylon", nodeAsset)),
});
