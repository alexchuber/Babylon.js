import { USD2GLTFBlock } from "node-assets/Blocks/usd2GLTFBlock";

import { RegisterBlockDescriptor, USDCategory, USDHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2gltf",
    label: "USD → glTF",
    category: USDCategory,
    description: "Convert a USD stage into a glTF document.",
    keywords: ["convert", "transcode", "usd", "gltf", "glb"],
    headerColor: USDHeaderColor,
    className: USD2GLTFBlock.ClassName,
    create: (nodeAsset) => new USD2GLTFBlock("USD → glTF", nodeAsset),
});
