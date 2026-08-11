import { FBXToUniversalBlock } from "node-assets/Blocks/fbxToUniversalBlock";

import { FBXHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "fbx-to-universal",
    label: "FBX → Universal",
    description: "Parse an FBX source and cross into Universal.",
    keywords: ["convert", "transcode", "fbx", "Universal"],
    category: ImportersCategory,
    headerColor: FBXHeaderColor,
    className: FBXToUniversalBlock.ClassName,
    abstractedBy: "import-fbx",
    create: (nodeAsset) => new FBXToUniversalBlock("FBX → Universal", nodeAsset),
});
