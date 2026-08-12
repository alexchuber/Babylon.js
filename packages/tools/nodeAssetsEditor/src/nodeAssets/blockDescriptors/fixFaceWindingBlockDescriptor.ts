import { FixFaceWindingBlock } from "node-assets/Blocks/fixFaceWindingBlock";

import { CleanupFamily, TransformHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "fix-face-winding",
    label: "Fix Face Winding",
    description: "Make adjacent triangle faces use consistent winding.",
    keywords: ["faces", "winding", "orientation", "triangles", "repair", "cleanup"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: CleanupFamily,
    className: FixFaceWindingBlock.ClassName,
    create: (nodeAsset) => new FixFaceWindingBlock("Fix Face Winding", nodeAsset),
});
