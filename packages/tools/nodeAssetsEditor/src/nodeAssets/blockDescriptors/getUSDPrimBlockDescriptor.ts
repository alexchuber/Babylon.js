import { GetUSDPrimBlock } from "node-assets/Blocks/getUSDPrimBlock";

import { RegisterBlockDescriptor, SelectorsHeaderColor, UsdCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-usd-prim",
    label: "Get USD Prim",
    category: UsdCategory,
    isPaletteVisible: false,
    description: "Read a USD prim and its authored properties by absolute path.",
    keywords: ["usd", "prim", "path", "properties", "lookup"],
    headerColor: SelectorsHeaderColor,
    className: GetUSDPrimBlock.ClassName,
    create: (nodeAsset) => new GetUSDPrimBlock("Get USD Prim", nodeAsset),
});
