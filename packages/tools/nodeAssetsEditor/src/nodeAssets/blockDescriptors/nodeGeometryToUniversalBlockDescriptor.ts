import { NodeGeometryToUniversalBlock } from "node-assets/Blocks/nodeGeometryToUniversalBlock";

import { ConfigureBlockForEditor, TranscodersCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "node-geometry-to-universal",
    label: "Node Geometry → Universal",
    description: "Parse and evaluate Node Geometry directly into Universal.",
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: NodeGeometryToUniversalBlock.ClassName,
    abstractedBy: "import-node-geometry",
    create: (nodeAsset) => ConfigureBlockForEditor(new NodeGeometryToUniversalBlock("Node Geometry → Universal", nodeAsset)),
});
