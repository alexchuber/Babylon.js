import { UniversalToGLTFBlock } from "node-assets/Blocks/universalToGLTFBlock";

import { ConfigureBlockForEditor, TranscodersCategory, RegisterBlockDescriptor, TranscoderHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "universal-to-gltf",
    label: "Universal → glTF",
    description: "Cross explicitly from Universal into the glTF delivery lane.",
    category: TranscodersCategory,
    headerColor: TranscoderHeaderColor,
    className: UniversalToGLTFBlock.ClassName,
    abstractedBy: "export-gltf",
    create: (nodeAsset) => ConfigureBlockForEditor(new UniversalToGLTFBlock("Universal → glTF", nodeAsset)),
});
