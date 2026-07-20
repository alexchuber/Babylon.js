import { BabylonSelectorBlock } from "node-assets/Blocks/babylonSelectorBlock";

import { BabylonCategory, BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-selector",
    label: "Babylon Selector",
    category: BabylonCategory,
    description: "Select a Babylon mesh, light, camera, or node by name.",
    keywords: ["babylon", "query", "mesh", "light", "camera", "node"],
    headerColor: BabylonHeaderColor,
    className: BabylonSelectorBlock.ClassName,
    create: (nodeAsset) => new BabylonSelectorBlock("Babylon Selector", nodeAsset),
});
