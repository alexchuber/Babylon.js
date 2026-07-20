import { USDSelectorBlock } from "node-assets/Blocks/usdSelectorBlock";

import { RegisterBlockDescriptor, USDCategory, USDHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-selector",
    label: "USD Selector",
    category: USDCategory,
    description: "Select USD prims by path, glob, or kind.",
    keywords: ["usd", "query", "prim", "path", "glob", "kind"],
    headerColor: USDHeaderColor,
    className: USDSelectorBlock.ClassName,
    create: (nodeAsset) => new USDSelectorBlock("USD Selector", nodeAsset),
});
