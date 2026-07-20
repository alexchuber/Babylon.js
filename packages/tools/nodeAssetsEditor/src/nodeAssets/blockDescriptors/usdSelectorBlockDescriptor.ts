import { USDSelectorBlock } from "node-assets/Blocks/usdSelectorBlock";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-selector",
    label: "USD Selector",
    category: SelectorsCategory,
    isPaletteVisible: false,
    description: "Select USD prims by path, glob, or kind.",
    keywords: ["usd", "query", "prim", "path", "glob", "kind"],
    headerColor: SelectorsHeaderColor,
    className: USDSelectorBlock.ClassName,
    create: (nodeAsset) => new USDSelectorBlock("USD Selector", nodeAsset),
});
