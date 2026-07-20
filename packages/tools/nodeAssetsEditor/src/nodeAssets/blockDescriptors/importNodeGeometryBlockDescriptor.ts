import { ImportNodeGeometryAggregateBlock } from "node-assets/Blocks/importNodeGeometryAggregateBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-node-geometry",
    label: "Import Node Geometry",
    category: "Inputs",
    description: "Read and evaluate Node Geometry into Universal.",
    keywords: ["node geometry", "NGE", "procedural geometry", "snippet", "Universal"],
    headerColor: ImportHeaderColor,
    className: ImportNodeGeometryAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryAggregateBlock("Import Node Geometry", nodeAsset)),
});
