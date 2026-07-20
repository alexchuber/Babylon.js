import { BabylonToUniversalBlock } from "node-assets/Blocks/babylonToUniversalBlock";

import { BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-to-universal",
    label: "Babylon to Universal",
    description: "Parse a Babylon source and cross into Universal.",
    keywords: ["convert", "transcode", "babylon", "Universal"],
    category: "Babylon",
    headerColor: BabylonHeaderColor,
    className: BabylonToUniversalBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => new BabylonToUniversalBlock("Babylon to Universal", nodeAsset),
});
