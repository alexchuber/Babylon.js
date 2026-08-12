import { Babylon2GLTFBlock } from "node-assets/Blocks/babylon2GLTFBlock";

import { BabylonCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon2gltf",
    label: "Babylon → glTF",
    category: BabylonCategory,
    isPaletteVisible: false,
    description: "Convert a Babylon scene into a glTF document.",
    keywords: ["convert", "transcode", "babylon", "scene", "gltf", "glb"],
    headerColor: TranscoderHeaderColor,
    className: Babylon2GLTFBlock.ClassName,
    create: (nodeAsset) => new Babylon2GLTFBlock("Babylon → glTF", nodeAsset),
});
