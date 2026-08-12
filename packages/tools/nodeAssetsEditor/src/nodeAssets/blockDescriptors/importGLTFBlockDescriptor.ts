import { ImportGLTFAggregateBlock } from "node-assets/Blocks/importGLTFAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, InputHeaderColor, ImportersCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    description: "Read glTF or GLB and cross into Universal.",
    keywords: ["open", "load", "source", "model", "GLB", "Universal"],
    category: ImportersCategory,
    family: AggregateImportsFamily,
    headerColor: InputHeaderColor,
    className: ImportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFAggregateBlock("Import glTF", nodeAsset)),
});
