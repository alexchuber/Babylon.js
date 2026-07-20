import { GetProperty } from "node-assets/Blocks/getProperty";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-property",
    label: "Get Property",
    description: "Read a scene value selected by a glTF pointer.",
    keywords: ["read", "inspect", "selector", "pointer", "value"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
    className: GetProperty.ClassName,
    create: (nodeAsset) => new GetProperty("Get Property", nodeAsset),
});
