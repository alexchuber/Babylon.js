import { ImportUSDAggregateBlock } from "node-assets/Blocks/importUSDAggregateBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-usd",
    label: "Import USD",
    description: "Read USD and cross into Universal.",
    keywords: ["open", "load", "source", "Pixar", "USDZ", "Universal"],
    category: "Inputs",
    headerColor: ImportHeaderColor,
    className: ImportUSDAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportUSDAggregateBlock("Import USD", nodeAsset)),
});
