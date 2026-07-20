import { ImportGLTFAggregateBlock } from "node-assets/Blocks/importGLTFAggregateBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    description: "Read glTF or GLB and cross into Universal.",
    keywords: ["open", "load", "source", "model", "GLB", "Universal"],
    category: "Inputs",
    headerColor: ImportHeaderColor,
    className: ImportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFAggregateBlock("Import glTF", nodeAsset)),
});
