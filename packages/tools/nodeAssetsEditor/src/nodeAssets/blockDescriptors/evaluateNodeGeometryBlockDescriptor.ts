import { EvaluateNodeGeometryBlock } from "node-assets/Blocks/evaluateNodeGeometryBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "evaluate-node-geometry",
    label: "Evaluate Node Geometry",
    category: TranscodersCategory,
    headerColor: TranscodersHeaderColor,
    className: EvaluateNodeGeometryBlock.ClassName,
    create: (nodeAsset) => new EvaluateNodeGeometryBlock("Evaluate Node Geometry", nodeAsset),
});
