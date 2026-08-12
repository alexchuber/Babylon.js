import { USD2GLTFBlock } from "node-assets/Blocks/usd2GLTFBlock";

import { RegisterBlockDescriptor, TranscoderHeaderColor, UsdCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2gltf",
    label: "USD → glTF",
    category: UsdCategory,
    isPaletteVisible: false,
    description: "Convert a USD stage into a glTF document.",
    keywords: ["convert", "transcode", "usd", "gltf", "glb"],
    headerColor: TranscoderHeaderColor,
    className: USD2GLTFBlock.ClassName,
    create: (nodeAsset) => new USD2GLTFBlock("USD → glTF", nodeAsset),
});
