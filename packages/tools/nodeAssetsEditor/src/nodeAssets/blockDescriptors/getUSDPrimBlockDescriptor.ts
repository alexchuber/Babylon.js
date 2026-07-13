import { GetUSDPrimBlock } from "node-assets/Blocks/getUSDPrimBlock";

import { RegisterBlockDescriptor, USDCategory, USDHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-usd-prim",
    label: "Get USD Prim",
    category: USDCategory,
    headerColor: USDHeaderColor,
    className: GetUSDPrimBlock.ClassName,
    create: (nodeAsset) => new GetUSDPrimBlock("Get USD Prim", nodeAsset),
});
