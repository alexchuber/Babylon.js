import { USD2BabylonBlock } from "node-assets/Blocks/usd2BabylonBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2babylon",
    label: "USD → Babylon",
    category: TranscodersCategory,
    headerColor: TranscodersHeaderColor,
    className: USD2BabylonBlock.ClassName,
    create: (nodeAsset) => new USD2BabylonBlock("USD → Babylon", nodeAsset),
});
