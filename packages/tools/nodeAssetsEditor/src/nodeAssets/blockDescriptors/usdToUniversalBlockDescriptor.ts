import { USDToUniversalBlock } from "node-assets/Blocks/usdToUniversalBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-to-universal",
    label: "USD to Universal",
    description: "Parse USD and cross explicitly into Universal.",
    category: "USD",
    headerColor: TranscodersHeaderColor,
    className: USDToUniversalBlock.ClassName,
    abstractedBy: "import-usd",
    create: (nodeAsset) => ConfigureBlockForEditor(new USDToUniversalBlock("USD to Universal", nodeAsset)),
});
