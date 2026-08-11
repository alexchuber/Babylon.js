import { ImportBabylonAggregateBlock } from "node-assets/Blocks/importBabylonAggregateBlock";

import { AggregateImportsFamily, BabylonHeaderColor, ConfigureBlockForEditor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-babylon",
    label: "Import Babylon",
    description: "Read a .babylon source and cross into Universal.",
    keywords: ["open", "load", "source", "babylon", "Universal"],
    category: InputsCategory,
    family: AggregateImportsFamily,
    headerColor: BabylonHeaderColor,
    className: ImportBabylonAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportBabylonAggregateBlock("Import Babylon", nodeAsset)),
});
