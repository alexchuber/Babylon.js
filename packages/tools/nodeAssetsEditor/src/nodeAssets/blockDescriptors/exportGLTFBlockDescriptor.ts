import { ExportGLTFAggregateBlock } from "node-assets/Blocks/exportGLTFAggregateBlock";

import { ConfigureBlockForEditor, EncodingOutputFamily, OutputHeaderColor, ExportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    description: "Cross Universal into glTF and write a binary GLB.",
    keywords: ["save", "download", "output", "GLB"],
    category: ExportersCategory,
    family: EncodingOutputFamily,
    headerColor: OutputHeaderColor,
    className: ExportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportGLTFAggregateBlock("Export glTF", nodeAsset)),
});
