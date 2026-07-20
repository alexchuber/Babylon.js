import { BabylonSelectorBlock } from "node-assets/Blocks/babylonSelectorBlock";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-selector",
    label: "Babylon Selector",
    category: SelectorsCategory,
    isPaletteVisible: false,
    description: "Select a Babylon mesh, light, camera, or node by name.",
    keywords: ["babylon", "query", "mesh", "light", "camera", "node"],
    headerColor: SelectorsHeaderColor,
    className: BabylonSelectorBlock.ClassName,
    create: (nodeAsset) => new BabylonSelectorBlock("Babylon Selector", nodeAsset),
});
