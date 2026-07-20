import { NodeGeometryToUniversalBlock } from "node-assets/Blocks/nodeGeometryToUniversalBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "node-geometry-to-universal",
    label: "Node Geometry to Universal",
    description: "Parse and evaluate Node Geometry directly into Universal.",
    category: "Node Geometry",
    headerColor: TranscodersHeaderColor,
    className: NodeGeometryToUniversalBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new NodeGeometryToUniversalBlock("Node Geometry to Universal", nodeAsset)),
});
