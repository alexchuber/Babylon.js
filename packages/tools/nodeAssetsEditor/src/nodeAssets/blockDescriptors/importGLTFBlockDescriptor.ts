import { ImportGLTFAggregateBlock } from "node-assets/Blocks/importGLTFAggregateBlock";

import { AggregateImportsFamily, ConfigureBlockForEditor, InputsCategory, RegisterBlockDescriptor } from "../blockCatalog";

const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    description: "Read glTF or GLB and cross into Universal.",
    keywords: ["open", "load", "source", "model", "GLB", "Universal"],
    category: InputsCategory,
    family: AggregateImportsFamily,
    headerColor: ImportHeaderColor,
    className: ImportGLTFAggregateBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFAggregateBlock("Import glTF", nodeAsset)),
});
