import { OBJToUniversalBlock } from "node-assets/Blocks/objToUniversalBlock";

import { OBJHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "obj-to-universal",
    label: "OBJ to Universal",
    description: "Parse an OBJ source and cross into Universal.",
    keywords: ["convert", "transcode", "obj", "Universal"],
    category: "OBJ",
    headerColor: OBJHeaderColor,
    className: OBJToUniversalBlock.ClassName,
    abstractedBy: "import-obj",
    create: (nodeAsset) => new OBJToUniversalBlock("OBJ to Universal", nodeAsset),
});
