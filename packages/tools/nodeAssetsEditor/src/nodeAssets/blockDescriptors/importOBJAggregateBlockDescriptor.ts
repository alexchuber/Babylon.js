import { ImportOBJAggregateBlock } from "node-assets/Blocks/importOBJAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, InputsCategory, OBJHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-obj",
    label: "Import OBJ",
    description: "Read an OBJ source and cross into Universal.",
    keywords: ["open", "load", "source", "obj", "Universal"],
    category: InputsCategory,
    family: AggregateImportsFamily,
    headerColor: OBJHeaderColor,
    className: ImportOBJAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportOBJAggregateBlock("Import OBJ", nodeAsset)),
});
