import { ExportGLTFAggregateBlock } from "node-assets/Blocks/exportGLTFAggregateBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

const ExportHeaderColor = "#3a6ea5";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    description: "Cross Universal into glTF and write a binary GLB.",
    keywords: ["save", "download", "output", "GLB"],
    category: "glTF",
    headerColor: ExportHeaderColor,
    className: ExportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportGLTFAggregateBlock("Export glTF", nodeAsset)),
});
