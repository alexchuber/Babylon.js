import { SetProperty } from "node-assets/Blocks/setProperty";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-property",
    label: "Set Property",
    description: "Write a value to a scene property selected by a glTF pointer.",
    keywords: ["edit", "override", "selector", "pointer", "value"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
    className: SetProperty.ClassName,
    create: (nodeAsset) => new SetProperty("Set Property", nodeAsset),
});
