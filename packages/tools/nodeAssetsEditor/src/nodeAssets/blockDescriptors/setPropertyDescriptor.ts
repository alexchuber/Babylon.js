import { SetProperty } from "node-assets/Blocks/setProperty";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-property",
    label: "Set Property",
    description: "Write a value to a scene property selected by a glTF pointer.",
    keywords: ["edit", "override", "selector", "pointer", "value"],
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: SetProperty.ClassName,
    create: (nodeAsset) => new SetProperty("Set Property", nodeAsset),
});
