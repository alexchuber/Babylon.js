import { SetTexture } from "node-assets/Blocks/setTexture";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-texture",
    label: "Set Texture",
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: SetTexture.ClassName,
    create: (nodeAsset) => new SetTexture("Set Texture", nodeAsset),
});
