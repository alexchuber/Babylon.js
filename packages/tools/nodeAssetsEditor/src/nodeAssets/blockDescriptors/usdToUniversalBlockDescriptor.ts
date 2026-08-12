import { USDToUniversalBlock } from "node-assets/Blocks/usdToUniversalBlock";

import { ConfigureBlockForEditor, TranscodersCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-to-universal",
    label: "USD → Universal",
    description: "Parse USD and cross explicitly into Universal.",
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: USDToUniversalBlock.ClassName,
    abstractedBy: "import-usd",
    create: (nodeAsset) => ConfigureBlockForEditor(new USDToUniversalBlock("USD → Universal", nodeAsset)),
});
