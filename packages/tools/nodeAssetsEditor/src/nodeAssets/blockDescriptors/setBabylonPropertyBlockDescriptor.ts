import { SetBabylonPropertyBlock } from "node-assets/Blocks/setBabylonPropertyBlock";

import { BabylonCategory, BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-babylon-property",
    label: "Set Babylon Property",
    category: BabylonCategory,
    headerColor: BabylonHeaderColor,
    className: SetBabylonPropertyBlock.ClassName,
    create: (nodeAsset) => new SetBabylonPropertyBlock("Set Babylon Property", nodeAsset),
});
