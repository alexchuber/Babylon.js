import { Babylon2GLTFBlock } from "node-assets/Blocks/babylon2GLTFBlock";

import { BabylonCategory, BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon2gltf",
    label: "Babylon → glTF",
    category: BabylonCategory,
    description: "Convert a Babylon scene into a glTF document.",
    keywords: ["convert", "transcode", "babylon", "scene", "gltf", "glb"],
    headerColor: BabylonHeaderColor,
    className: Babylon2GLTFBlock.ClassName,
    create: (nodeAsset) => new Babylon2GLTFBlock("Babylon → glTF", nodeAsset),
});
