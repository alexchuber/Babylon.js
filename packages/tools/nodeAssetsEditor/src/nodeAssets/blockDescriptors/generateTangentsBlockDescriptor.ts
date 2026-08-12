import { GenerateTangentsBlock } from "node-assets/Blocks/generateTangentsBlock";

import { AttributesFamily, TransformHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "generate-tangents",
    label: "Generate Tangents",
    description: "Generate MikkTSpace vertex tangents.",
    keywords: ["tangents", "normal map", "mikktspace"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: AttributesFamily,
    className: GenerateTangentsBlock.ClassName,
    create: (nodeAsset) => new GenerateTangentsBlock("Generate Tangents", nodeAsset),
});
