import { BabylonToUniversalBlock } from "node-assets/Blocks/babylonToUniversalBlock";

import { TranscoderHeaderColor, TranscodersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-to-universal",
    label: "Babylon → Universal",
    description: "Parse a Babylon source and cross into Universal.",
    keywords: ["convert", "transcode", "babylon", "Universal"],
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: BabylonToUniversalBlock.ClassName,
    abstractedBy: "import-babylon",
    create: (nodeAsset) => new BabylonToUniversalBlock("Babylon → Universal", nodeAsset),
});
