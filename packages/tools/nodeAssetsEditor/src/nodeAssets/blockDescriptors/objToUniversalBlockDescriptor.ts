import { OBJToUniversalBlock } from "node-assets/Blocks/objToUniversalBlock";

import { OBJHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "obj-to-universal",
    label: "OBJ → Universal",
    description: "Parse an OBJ source and cross into Universal.",
    keywords: ["convert", "transcode", "obj", "Universal"],
    category: ImportersCategory,
    headerColor: OBJHeaderColor,
    className: OBJToUniversalBlock.ClassName,
    abstractedBy: "import-obj",
    create: (nodeAsset) => new OBJToUniversalBlock("OBJ → Universal", nodeAsset),
});
