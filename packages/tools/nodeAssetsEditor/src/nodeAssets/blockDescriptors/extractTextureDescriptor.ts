import { ExtractTexture } from "node-assets/Blocks/extractTexture";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "extract-texture",
    label: "Extract Texture",
    description: "Read an image from a selected material texture slot.",
    keywords: ["get texture", "material", "image", "texture slot", "selector"],
    headerColor: SelectorsHeaderColor,
    category: SelectorsCategory,
    isPaletteVisible: false,
    className: ExtractTexture.ClassName,
    create: (nodeAsset) => new ExtractTexture("Extract Texture", nodeAsset),
});
