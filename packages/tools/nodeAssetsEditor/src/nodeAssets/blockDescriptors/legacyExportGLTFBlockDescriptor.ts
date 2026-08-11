import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";

import { ConfigureBlockForEditor, GltfCategory, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "legacy-export-gltf",
    label: "Export glTF",
    description: "Legacy direct glTF export retained for saved-graph compatibility.",
    category: GltfCategory,
    headerColor: "#3a6ea5",
    className: ExportGLTFBlock.ClassName,
    isPaletteVisible: false,
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
