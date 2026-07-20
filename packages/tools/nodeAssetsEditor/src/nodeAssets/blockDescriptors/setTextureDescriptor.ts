import { SetTexture } from "node-assets/Blocks/setTexture";

import { ImageCategory, ImageHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "set-texture",
    label: "Set Texture",
    description: "Assign an image to a selected material texture slot.",
    keywords: ["replace texture", "material", "image", "texture slot", "selector"],
    headerColor: ImageHeaderColor,
    category: ImageCategory,
    className: SetTexture.ClassName,
    create: (nodeAsset) => new SetTexture("Set Texture", nodeAsset),
});
