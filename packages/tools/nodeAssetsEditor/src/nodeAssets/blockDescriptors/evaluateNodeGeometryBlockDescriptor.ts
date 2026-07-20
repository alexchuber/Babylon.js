import { EvaluateNodeGeometryBlock } from "node-assets/Blocks/evaluateNodeGeometryBlock";

import { NodeGeometryCategory, NodeGeometryHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "evaluate-node-geometry",
    label: "Evaluate Node Geometry",
    category: NodeGeometryCategory,
    description: "Evaluate a Node Geometry graph and capture its vertex data.",
    keywords: ["node geometry", "NGE", "evaluate", "procedural geometry", "vertex data"],
    headerColor: NodeGeometryHeaderColor,
    className: EvaluateNodeGeometryBlock.ClassName,
    create: (nodeAsset) => new EvaluateNodeGeometryBlock("Evaluate Node Geometry", nodeAsset),
});
