import { ImportFBXAggregateBlock } from "node-assets/Blocks/importFBXAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, InputHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-fbx",
    label: "Import FBX",
    description: "Read an uploaded .fbx source and cross into Universal.",
    keywords: ["open", "load", "source", "fbx", "Universal"],
    category: ImportersCategory,
    family: AggregateImportsFamily,
    headerColor: InputHeaderColor,
    className: ImportFBXAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportFBXAggregateBlock("Import FBX", nodeAsset)),
});
