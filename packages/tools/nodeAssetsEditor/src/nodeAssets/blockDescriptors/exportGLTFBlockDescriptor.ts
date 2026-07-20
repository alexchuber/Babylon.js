import { ExportGLTFAggregateBlock } from "node-assets/Blocks/exportGLTFAggregateBlock";

import { ConfigureBlockForEditor, EncodingOutputFamily, RegisterBlockDescriptor } from "../blockCatalog";

const ExportHeaderColor = "#3a6ea5";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    description: "Cross Universal into glTF and write a binary GLB.",
    keywords: ["save", "download", "output", "GLB"],
    category: "glTF",
    family: EncodingOutputFamily,
    headerColor: ExportHeaderColor,
    className: ExportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportGLTFAggregateBlock("Export glTF", nodeAsset)),
});
