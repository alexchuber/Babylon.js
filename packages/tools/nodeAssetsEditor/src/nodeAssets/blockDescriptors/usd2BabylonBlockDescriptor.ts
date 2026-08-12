import { USD2BabylonBlock } from "node-assets/Blocks/usd2BabylonBlock";

import { RegisterBlockDescriptor, TranscoderHeaderColor, UsdCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2babylon",
    label: "USD → Babylon",
    category: UsdCategory,
    isPaletteVisible: false,
    description: "Convert a USD stage into a Babylon scene.",
    keywords: ["convert", "transcode", "usd", "babylon", "scene"],
    headerColor: TranscoderHeaderColor,
    className: USD2BabylonBlock.ClassName,
    create: (nodeAsset) => new USD2BabylonBlock("USD → Babylon", nodeAsset),
});
