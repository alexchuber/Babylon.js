import { GLTFToUniversalBlock } from "node-assets/Blocks/gltfToUniversalBlock";

import { ConfigureBlockForEditor, TranscodersCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf-to-universal",
    label: "glTF → Universal",
    description: "Cross explicitly from glTF into Universal.",
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: GLTFToUniversalBlock.ClassName,
    abstractedBy: "import-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new GLTFToUniversalBlock("glTF → Universal", nodeAsset)),
});
