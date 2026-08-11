import { GLTFToUniversalBlock } from "node-assets/Blocks/gltfToUniversalBlock";

import { ConfigureBlockForEditor, ImportersCategory, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf-to-universal",
    label: "glTF → Universal",
    description: "Cross explicitly from glTF into Universal.",
    category: ImportersCategory,
    headerColor: TranscodersHeaderColor,
    className: GLTFToUniversalBlock.ClassName,
    abstractedBy: "import-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new GLTFToUniversalBlock("glTF → Universal", nodeAsset)),
});
