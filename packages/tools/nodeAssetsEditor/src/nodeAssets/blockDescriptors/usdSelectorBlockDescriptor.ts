import { USDSelectorBlock } from "node-assets/Blocks/usdSelectorBlock";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-selector",
    label: "USD Selector",
    category: SelectorsCategory,
    headerColor: SelectorsHeaderColor,
    className: USDSelectorBlock.ClassName,
    create: (nodeAsset) => new USDSelectorBlock("USD Selector", nodeAsset),
});
