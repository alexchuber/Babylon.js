import { GetProperty } from "node-assets/Blocks/getProperty";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-property",
    label: "Get Property",
    description: "Read a scene value selected by a glTF pointer.",
    keywords: ["read", "inspect", "selector", "pointer", "value"],
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    isPaletteVisible: false,
    className: GetProperty.ClassName,
    create: (nodeAsset) => new GetProperty("Get Property", nodeAsset),
});
