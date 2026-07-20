import { ImportNodeGeometryBlock } from "node-assets/Blocks/importNodeGeometryBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "legacy-import-node-geometry",
    label: "Legacy Import Node Geometry",
    category: "Inputs",
    headerColor: "#3f6fd9",
    className: ImportNodeGeometryBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryBlock("Import Node Geometry", nodeAsset)),
});
