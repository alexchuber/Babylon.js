import { BabylonSelectorBlock } from "node-assets/Blocks/babylonSelectorBlock";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon-selector",
    label: "Babylon Selector",
    category: SelectorsCategory,
    headerColor: SelectorsHeaderColor,
    className: BabylonSelectorBlock.ClassName,
    create: (nodeAsset) => new BabylonSelectorBlock("Babylon Selector", nodeAsset),
});
