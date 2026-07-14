import { GLTF2BabylonBlock } from "node-assets/Blocks/gltf2BabylonBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "gltf2babylon",
    label: "glTF → Babylon",
    category: TranscodersCategory,
    headerColor: TranscodersHeaderColor,
    className: GLTF2BabylonBlock.ClassName,
    create: (nodeAsset) => new GLTF2BabylonBlock("glTF → Babylon", nodeAsset),
});
