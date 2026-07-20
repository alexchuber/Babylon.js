import { GenerateTangentsBlock } from "node-assets/Blocks/generateTangentsBlock";

import { RegisterBlockDescriptor, UniversalAttributesCategory, UniversalAttributesHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "generate-tangents",
    label: "Generate Tangents",
    description: "Generate MikkTSpace vertex tangents.",
    keywords: ["tangents", "normal map", "mikktspace"],
    headerColor: UniversalAttributesHeaderColor,
    category: UniversalAttributesCategory,
    className: GenerateTangentsBlock.ClassName,
    create: (nodeAsset) => new GenerateTangentsBlock("Generate Tangents", nodeAsset),
});
