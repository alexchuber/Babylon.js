import { GLTF2BabylonBlock } from "node-assets/Blocks/gltf2BabylonBlock";

import { GltfCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf2babylon",
    label: "glTF → Babylon",
    category: GltfCategory,
    isPaletteVisible: false,
    description: "Convert a glTF document into a Babylon scene.",
    keywords: ["convert", "transcode", "gltf", "glb", "babylon", "scene"],
    headerColor: TranscoderHeaderColor,
    className: GLTF2BabylonBlock.ClassName,
    create: (nodeAsset) => new GLTF2BabylonBlock("glTF → Babylon", nodeAsset),
});
