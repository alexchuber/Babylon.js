import { ImportUSDAggregateBlock } from "node-assets/Blocks/importUSDAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, InputHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-usd",
    label: "Import USD",
    description: "Read USD and cross into Universal.",
    keywords: ["open", "load", "source", "Pixar", "USDZ", "Universal"],
    category: ImportersCategory,
    family: AggregateImportsFamily,
    headerColor: InputHeaderColor,
    className: ImportUSDAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportUSDAggregateBlock("Import USD", nodeAsset)),
});
