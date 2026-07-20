import { GLTFSelectorBlock } from "node-assets/Blocks/gltfSelectorBlock";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf-selector",
    label: "glTF Selector",
    category: GltfCategory,
    description: "Select glTF JSON data using a JSON Pointer.",
    keywords: ["gltf", "query", "JSON Pointer", "path", "material", "node"],
    headerColor: GltfHeaderColor,
    className: GLTFSelectorBlock.ClassName,
    create: (nodeAsset) => new GLTFSelectorBlock("glTF Selector", nodeAsset),
});
