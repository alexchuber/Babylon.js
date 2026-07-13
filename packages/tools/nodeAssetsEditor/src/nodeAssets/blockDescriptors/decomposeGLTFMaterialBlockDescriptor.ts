import { DecomposeGLTFMaterialBlock } from "node-assets/Blocks/decomposeGLTFMaterialBlock";

import { OperatorHeaderColor, RegisterBlockDescriptor, OperatorCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "decompose-gltf-material",
    label: "Decompose glTF Material",
    category: OperatorCategory,
    headerColor: OperatorHeaderColor,
    className: DecomposeGLTFMaterialBlock.ClassName,
    create: (nodeAsset) => new DecomposeGLTFMaterialBlock("Decompose glTF Material", nodeAsset),
});
