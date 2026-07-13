import { ComposeGLTFMaterialBlock } from "node-assets/Blocks/composeGLTFMaterialBlock";

import { OperatorHeaderColor, RegisterBlockDescriptor, OperatorCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "compose-gltf-material",
    label: "Compose glTF Material",
    category: OperatorCategory,
    headerColor: OperatorHeaderColor,
    className: ComposeGLTFMaterialBlock.ClassName,
    create: (nodeAsset) => new ComposeGLTFMaterialBlock("Compose glTF Material", nodeAsset),
});
