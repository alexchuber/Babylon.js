import { GLTF2BabylonBlock } from "node-assets/Blocks/gltf2BabylonBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf2babylon",
    label: "glTF → Babylon",
    category: TranscodersCategory,
    description: "Convert a glTF document into a Babylon scene.",
    keywords: ["convert", "transcode", "gltf", "glb", "babylon", "scene"],
    headerColor: TranscodersHeaderColor,
    className: GLTF2BabylonBlock.ClassName,
    create: (nodeAsset) => new GLTF2BabylonBlock("glTF → Babylon", nodeAsset),
});
