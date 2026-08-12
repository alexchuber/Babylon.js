import { SetBabylonPropertyBlock } from "node-assets/Blocks/setBabylonPropertyBlock";

import { BabylonCategory, RegisterBlockDescriptor, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-babylon-property",
    label: "Set Babylon Property",
    category: BabylonCategory,
    isPaletteVisible: false,
    description: "Set a Babylon scene property using a dot or bracket path.",
    keywords: ["babylon", "property", "path", "edit", "modify", "scene"],
    headerColor: SelectorsHeaderColor,
    className: SetBabylonPropertyBlock.ClassName,
    create: (nodeAsset) => new SetBabylonPropertyBlock("Set Babylon Property", nodeAsset),
});
