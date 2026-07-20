import { BabylonToUniversalBlock } from "node-assets/Blocks/babylonToUniversalBlock";

import { BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-to-universal",
    label: "Babylon → Universal",
    description: "Parse a Babylon source and cross into Universal.",
    keywords: ["convert", "transcode", "babylon", "Universal"],
    category: "Babylon",
    headerColor: BabylonHeaderColor,
    className: BabylonToUniversalBlock.ClassName,
    abstractedBy: "import-babylon",
    create: (nodeAsset) => new BabylonToUniversalBlock("Babylon → Universal", nodeAsset),
});
