import { USD2GLTFBlock } from "node-assets/Blocks/usd2GLTFBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "usd2gltf",
    label: "USD → glTF",
    category: TranscodersCategory,
    isPaletteVisible: false,
    description: "Convert a USD stage into a glTF document.",
    keywords: ["convert", "transcode", "usd", "gltf", "glb"],
    headerColor: TranscodersHeaderColor,
    className: USD2GLTFBlock.ClassName,
    create: (nodeAsset) => new USD2GLTFBlock("USD → glTF", nodeAsset),
});
