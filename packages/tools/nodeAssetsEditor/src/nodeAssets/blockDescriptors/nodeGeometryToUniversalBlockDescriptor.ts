import { NodeGeometryToUniversalBlock } from "node-assets/Blocks/nodeGeometryToUniversalBlock";

import { ConfigureBlockForEditor, ImportersCategory, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "node-geometry-to-universal",
    label: "Node Geometry → Universal",
    description: "Parse and evaluate Node Geometry directly into Universal.",
    category: ImportersCategory,
    headerColor: TranscodersHeaderColor,
    className: NodeGeometryToUniversalBlock.ClassName,
    abstractedBy: "import-node-geometry",
    create: (nodeAsset) => ConfigureBlockForEditor(new NodeGeometryToUniversalBlock("Node Geometry → Universal", nodeAsset)),
});
