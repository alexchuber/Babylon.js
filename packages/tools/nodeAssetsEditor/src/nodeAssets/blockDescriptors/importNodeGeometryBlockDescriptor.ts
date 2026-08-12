import { ImportNodeGeometryAggregateBlock } from "node-assets/Blocks/importNodeGeometryAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, ImportersCategory, InputHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-node-geometry",
    label: "Import Node Geometry",
    category: ImportersCategory,
    family: AggregateImportsFamily,
    description: "Read and evaluate Node Geometry into Universal.",
    keywords: ["node geometry", "NGE", "procedural geometry", "snippet", "Universal"],
    headerColor: InputHeaderColor,
    className: ImportNodeGeometryAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryAggregateBlock("Import Node Geometry", nodeAsset)),
});
