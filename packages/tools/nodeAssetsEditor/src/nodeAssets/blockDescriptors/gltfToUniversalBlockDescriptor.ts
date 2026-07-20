import { GLTFToUniversalBlock } from "node-assets/Blocks/gltfToUniversalBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf-to-universal",
    label: "glTF to Universal",
    description: "Cross explicitly from glTF into Universal.",
    category: "glTF",
    headerColor: TranscodersHeaderColor,
    className: GLTFToUniversalBlock.ClassName,
    aggregatePaletteItemId: "import-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new GLTFToUniversalBlock("glTF to Universal", nodeAsset)),
});
