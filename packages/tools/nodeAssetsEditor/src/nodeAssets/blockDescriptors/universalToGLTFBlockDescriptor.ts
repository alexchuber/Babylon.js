import { UniversalToGLTFBlock } from "node-assets/Blocks/universalToGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor, TranscodersHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "universal-to-gltf",
    label: "Universal to glTF",
    description: "Cross explicitly from Universal into the glTF delivery lane.",
    category: "Universal",
    headerColor: TranscodersHeaderColor,
    className: UniversalToGLTFBlock.ClassName,
    isPaletteVisible: false,
    create: (nodeAsset) => ConfigureBlockForEditor(new UniversalToGLTFBlock("Universal to glTF", nodeAsset)),
});
