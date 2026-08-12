import { ComposeGLTFMaterialBlock } from "node-assets/Blocks/composeGLTFMaterialBlock";

import { TransformHeaderColor, RegisterBlockDescriptor, OperatorCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "compose-gltf-material",
    label: "Compose glTF Material",
    category: OperatorCategory,
    isPaletteVisible: false,
    description: "Combine PBR factors and textures into a glTF material descriptor.",
    keywords: ["material", "PBR", "metallic", "roughness", "textures", "combine"],
    headerColor: TransformHeaderColor,
    className: ComposeGLTFMaterialBlock.ClassName,
    create: (nodeAsset) => new ComposeGLTFMaterialBlock("Compose glTF Material", nodeAsset),
});
