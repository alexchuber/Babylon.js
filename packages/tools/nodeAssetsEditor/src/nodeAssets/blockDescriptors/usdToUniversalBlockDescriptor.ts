import { USDToUniversalBlock } from "node-assets/Blocks/usdToUniversalBlock";

import { ConfigureBlockForEditor, ImportersCategory, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd-to-universal",
    label: "USD → Universal",
    description: "Parse USD and cross explicitly into Universal.",
    category: ImportersCategory,
    headerColor: TranscodersHeaderColor,
    className: USDToUniversalBlock.ClassName,
    abstractedBy: "import-usd",
    create: (nodeAsset) => ConfigureBlockForEditor(new USDToUniversalBlock("USD → Universal", nodeAsset)),
});
