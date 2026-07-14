import { GetBabylonMeshBlock } from "node-assets/Blocks/getBabylonMeshBlock";

import { BabylonCategory, BabylonHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "get-babylon-mesh",
    label: "Get Babylon Mesh",
    category: BabylonCategory,
    description: "Read geometry and transform properties from a Babylon mesh by name.",
    keywords: ["babylon", "mesh", "geometry", "transform", "vertices", "lookup"],
    headerColor: BabylonHeaderColor,
    className: GetBabylonMeshBlock.ClassName,
    create: (nodeAsset) => new GetBabylonMeshBlock("Get Babylon Mesh", nodeAsset),
});
