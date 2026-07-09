import { ExtractTexture } from "node-assets/Blocks/extractTexture";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "extract-texture",
    label: "Extract Texture",
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    className: ExtractTexture.ClassName,
    create: (nodeAsset) => new ExtractTexture("Extract Texture", nodeAsset),
});
