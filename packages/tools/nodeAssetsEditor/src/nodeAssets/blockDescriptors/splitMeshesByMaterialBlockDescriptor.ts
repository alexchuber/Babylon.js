import { SplitMeshesByMaterialBlock } from "node-assets/Blocks/splitMeshesByMaterialBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "split-meshes-by-material",
    label: "Split Meshes by Material",
    description: "Split Universal meshes so each resulting mesh uses one material.",
    keywords: ["structure", "mesh", "material", "separate"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: SplitMeshesByMaterialBlock.ClassName,
    create: (nodeAsset) => new SplitMeshesByMaterialBlock("Split Meshes by Material", nodeAsset),
});
