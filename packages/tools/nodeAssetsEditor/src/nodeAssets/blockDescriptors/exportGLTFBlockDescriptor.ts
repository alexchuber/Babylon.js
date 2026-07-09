import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the export boundary block.
const ExportHeaderColor = "#3a6ea5";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    headerColor: ExportHeaderColor,
    className: ExportGLTFBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportGLTFBlock("Export glTF", nodeAsset)),
    getPropertySection: (_block, { requestExport }) => ({
        title: "EXPORT",
        properties: [
            {
                kind: "button",
                label: "Export .glb",
                onClick: () => requestExport(),
            },
        ],
    }),
});
