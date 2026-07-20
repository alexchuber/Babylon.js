import { ImportNodeGeometryBlock } from "node-assets/Blocks/importNodeGeometryBlock";

import { ConfigureBlockForEditor, ImportsCategory, ImportsHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-node-geometry",
    label: "Import Node Geometry",
    category: ImportsCategory,
    description: "Load a Node Geometry graph from a URL or Playground snippet.",
    keywords: ["node geometry", "NGE", "procedural geometry", "snippet", "load"],
    headerColor: ImportsHeaderColor,
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
