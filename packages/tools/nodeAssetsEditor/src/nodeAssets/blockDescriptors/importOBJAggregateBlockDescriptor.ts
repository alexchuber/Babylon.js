import { ImportOBJAggregateBlock } from "node-assets/Blocks/importOBJAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, ImportersCategory, InputHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-obj",
    label: "Import OBJ",
    description: "Read an OBJ source and cross into Universal.",
    keywords: ["open", "load", "source", "obj", "Universal"],
    category: ImportersCategory,
    family: AggregateImportsFamily,
    headerColor: InputHeaderColor,
    className: ImportOBJAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportOBJAggregateBlock("Import OBJ", nodeAsset)),
});
