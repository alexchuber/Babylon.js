import { ExtractTexture } from "node-assets/Blocks/extractTexture";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "extract-texture",
    label: "Extract Texture",
    description: "Read an image from a selected material texture slot.",
    keywords: ["get texture", "material", "image", "texture slot", "selector"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: ExtractTexture.ClassName,
    create: (nodeAsset) => new ExtractTexture("Extract Texture", nodeAsset),
});
