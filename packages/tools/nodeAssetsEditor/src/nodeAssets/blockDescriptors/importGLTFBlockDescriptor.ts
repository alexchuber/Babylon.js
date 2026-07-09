import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the import boundary block.
const ImportHeaderColor = "#3f7d4e";

RegisterBlockDescriptor({
    paletteItemId: "import-gltf",
    label: "Import glTF",
    category: "Sources",
    headerColor: ImportHeaderColor,
    className: ImportGLTFBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportGLTFBlock("Import glTF", nodeAsset)),
});
