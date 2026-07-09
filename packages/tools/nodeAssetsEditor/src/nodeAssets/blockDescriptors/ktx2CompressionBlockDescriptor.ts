import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the KTX2 compression block.
const CompressionHeaderColor = "#7d5aa8";

RegisterBlockDescriptor({
    paletteItemId: "ktx2-compression",
    label: "KTX2 Compress",
    headerColor: CompressionHeaderColor,
    className: KTX2CompressionBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new KTX2CompressionBlock("KTX2 Compress", nodeAsset)),
});
