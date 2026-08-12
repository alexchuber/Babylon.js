import { ImportNodeGeometryBlock } from "node-assets/Blocks/importNodeGeometryBlock";

import { ConfigureBlockForEditor, InputHeaderColor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "legacy-import-node-geometry",
    label: "Legacy Import Node Geometry",
    category: InputsCategory,
    headerColor: InputHeaderColor,
    className: ImportNodeGeometryBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryBlock("Import Node Geometry", nodeAsset)),
});
