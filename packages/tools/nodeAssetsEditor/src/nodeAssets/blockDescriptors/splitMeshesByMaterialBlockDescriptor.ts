import { SplitMeshesByMaterialBlock } from "node-assets/Blocks/splitMeshesByMaterialBlock";

import { TransformHeaderColor, RegisterBlockDescriptor, StructureFamily, UniversalCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "split-meshes-by-material",
    label: "Split Meshes by Material",
    description: "Split Universal meshes so each resulting mesh uses one material.",
    keywords: ["structure", "mesh", "material", "separate"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: StructureFamily,
    className: SplitMeshesByMaterialBlock.ClassName,
    create: (nodeAsset) => new SplitMeshesByMaterialBlock("Split Meshes by Material", nodeAsset),
});
