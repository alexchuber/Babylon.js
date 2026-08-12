import { ExportImageBlock } from "node-assets/Blocks/exportImageBlock";

import { ConfigureBlockForEditor, ExportersCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "export-image",
    label: "Export Image",
    description: "Write the final image pipeline result.",
    keywords: ["save", "download", "output", "texture"],
    headerColor: ImageHeaderColor,
    category: ExportersCategory,
    isPaletteVisible: false,
    className: ExportImageBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportImageBlock("Export Image", nodeAsset)),
});
