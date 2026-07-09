import { GetProperty } from "node-assets/Blocks/getProperty";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-property",
    label: "Get Property",
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: GetProperty.ClassName,
    create: (nodeAsset) => new GetProperty("Get Property", nodeAsset),
});
