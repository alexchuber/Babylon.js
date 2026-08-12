import { OBJToUniversalBlock } from "node-assets/Blocks/objToUniversalBlock";

import { TranscoderHeaderColor, TranscodersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "obj-to-universal",
    label: "OBJ → Universal",
    description: "Parse an OBJ source and cross into Universal.",
    keywords: ["convert", "transcode", "obj", "Universal"],
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: OBJToUniversalBlock.ClassName,
    abstractedBy: "import-obj",
    create: (nodeAsset) => new OBJToUniversalBlock("OBJ → Universal", nodeAsset),
});
