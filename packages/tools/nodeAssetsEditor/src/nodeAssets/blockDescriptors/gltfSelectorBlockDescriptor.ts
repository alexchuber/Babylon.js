import { GLTFSelectorBlock } from "node-assets/Blocks/gltfSelectorBlock";

import { RegisterBlockDescriptor, SelectorsCategory, SelectorsHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf-selector",
    label: "glTF Selector",
    category: SelectorsCategory,
    headerColor: SelectorsHeaderColor,
    className: GLTFSelectorBlock.ClassName,
    create: (nodeAsset) => new GLTFSelectorBlock("glTF Selector", nodeAsset),
});
