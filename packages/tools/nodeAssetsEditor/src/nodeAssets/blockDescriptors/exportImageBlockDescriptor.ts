import { ExportImageBlock } from "node-assets/Blocks/exportImageBlock";

import { ConfigureBlockForEditor, ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "export-image",
    label: "Export Image",
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: ExportImageBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportImageBlock("Export Image", nodeAsset)),
});
