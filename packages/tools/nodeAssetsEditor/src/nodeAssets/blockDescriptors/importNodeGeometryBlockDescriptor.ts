import { ImportNodeGeometryBlock } from "node-assets/Blocks/importNodeGeometryBlock";

import { ConfigureBlockForEditor, RegisterBlockDescriptor } from "../blockCatalog";

// Data-driven node header color for the Node Geometry import block.
const ImportHeaderColor = "#3f6fd9";

RegisterBlockDescriptor({
    paletteItemId: "import-node-geometry",
    label: "Import Node Geometry",
    category: "Sources",
    headerColor: ImportHeaderColor,
    className: ImportNodeGeometryBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryBlock("Import Node Geometry", nodeAsset)),
    getPropertySection: (block, { refresh }) => {
        const importBlock = block as ImportNodeGeometryBlock;
        return {
            title: "IMPORT",
            properties: [
                {
                    kind: "text",
                    label: "URL or #snippetId",
                    value: (importBlock.url.value as string) ?? "",
                    onChange: (value: string) => {
                        importBlock.url.value = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
