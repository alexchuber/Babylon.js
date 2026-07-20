import { CustomAggregateBlock } from "node-assets/blockFoundation/customAggregateBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "custom-aggregate",
    label: "Custom Aggregate",
    description: "An editable aggregate detached from a built-in definition.",
    category: "Blocks",
    headerColor: "#5f6570",
    className: CustomAggregateBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new CustomAggregateBlock("Custom Aggregate", nodeAsset)),
});
