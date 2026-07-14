import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the export boundary block.
const ExportHeaderColor = "#3a6ea5";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    description: "Write the final scene as a binary glTF (.glb).",
    keywords: ["save", "download", "output", "GLB"],
    headerColor: ExportHeaderColor,
    className: ExportGLTFBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ExportGLTFBlock("Export glTF", nodeAsset)),
    getPropertySection: (block, { refresh, requestExport }) => {
        const exportBlock = block as ExportGLTFBlock;
        return {
            title: "EXPORT",
            properties: [
                {
                    kind: "text",
                    label: "Name",
                    value: exportBlock.fileName,
                    onChange: (value) => {
                        exportBlock.fileName = value;
                        refresh();
                    },
                },
                {
                    kind: "button",
                    label: "Export .glb",
                    onClick: () => requestExport(exportBlock.fileName),
                },
            ],
        };
    },
});
