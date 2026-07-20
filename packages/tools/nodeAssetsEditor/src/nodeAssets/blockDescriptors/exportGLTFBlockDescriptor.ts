import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";

import { ConfigureBlockForEditor, GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "export-gltf",
    label: "Export glTF",
    description: "Write the final scene as a binary glTF (.glb).",
    keywords: ["save", "download", "output", "GLB"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
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
