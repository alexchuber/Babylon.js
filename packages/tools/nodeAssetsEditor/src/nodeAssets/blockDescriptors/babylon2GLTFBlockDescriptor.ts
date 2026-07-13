import { Babylon2GLTFBlock } from "node-assets/Blocks/babylon2GLTFBlock";

import { RegisterBlockDescriptor, TranscodersCategory, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "babylon2gltf",
    label: "Babylon → glTF",
    category: TranscodersCategory,
    headerColor: TranscodersHeaderColor,
    className: Babylon2GLTFBlock.ClassName,
    create: (nodeAsset) => new Babylon2GLTFBlock("Babylon → glTF", nodeAsset),
});
