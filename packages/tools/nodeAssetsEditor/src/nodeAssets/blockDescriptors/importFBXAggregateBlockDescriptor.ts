import { ImportFBXAggregateBlock } from "node-assets/Blocks/importFBXAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, FBXHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-fbx",
    label: "Import FBX",
    description: "Read an uploaded .fbx source and cross into Universal.",
    keywords: ["open", "load", "source", "fbx", "Universal"],
    category: "Inputs",
    family: AggregateImportsFamily,
    headerColor: FBXHeaderColor,
    className: ImportFBXAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportFBXAggregateBlock("Import FBX", nodeAsset)),
});
