import { DecomposeGLTFMaterialBlock } from "node-assets/Blocks/decomposeGLTFMaterialBlock";

import { TransformHeaderColor, RegisterBlockDescriptor, OperatorCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "decompose-gltf-material",
    label: "Decompose glTF Material",
    category: OperatorCategory,
    isPaletteVisible: false,
    description: "Extract PBR factors and textures from a selected glTF material.",
    keywords: ["material", "PBR", "metallic", "roughness", "textures", "extract"],
    headerColor: TransformHeaderColor,
    className: DecomposeGLTFMaterialBlock.ClassName,
    create: (nodeAsset) => new DecomposeGLTFMaterialBlock("Decompose glTF Material", nodeAsset),
});
