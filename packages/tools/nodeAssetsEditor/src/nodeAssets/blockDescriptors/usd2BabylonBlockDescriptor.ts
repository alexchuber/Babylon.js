import { USD2BabylonBlock } from "node-assets/Blocks/usd2BabylonBlock";

import { RegisterBlockDescriptor, USDCategory, USDHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2babylon",
    label: "USD → Babylon",
    category: USDCategory,
    description: "Convert a USD stage into a Babylon scene.",
    keywords: ["convert", "transcode", "usd", "babylon", "scene"],
    headerColor: USDHeaderColor,
    className: USD2BabylonBlock.ClassName,
    create: (nodeAsset) => new USD2BabylonBlock("USD → Babylon", nodeAsset),
});
