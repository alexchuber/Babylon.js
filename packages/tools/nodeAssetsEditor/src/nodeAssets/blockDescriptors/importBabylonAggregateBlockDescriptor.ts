import { ImportBabylonAggregateBlock } from "node-assets/Blocks/importBabylonAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, ImportersCategory, InputHeaderColor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-babylon",
    label: "Import Babylon",
    description: "Read a .babylon source and cross into Universal.",
    keywords: ["open", "load", "source", "babylon", "Universal"],
    category: ImportersCategory,
    family: AggregateImportsFamily,
    headerColor: InputHeaderColor,
    className: ImportBabylonAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonAggregateBlock("Import Babylon", nodeAsset)),
});
