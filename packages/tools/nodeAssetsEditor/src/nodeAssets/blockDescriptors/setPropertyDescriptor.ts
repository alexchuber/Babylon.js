import { SetProperty } from "node-assets/Blocks/setProperty";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-property",
    label: "Set Property",
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: SetProperty.ClassName,
    create: (nodeAsset) => new SetProperty("Set Property", nodeAsset),
});
