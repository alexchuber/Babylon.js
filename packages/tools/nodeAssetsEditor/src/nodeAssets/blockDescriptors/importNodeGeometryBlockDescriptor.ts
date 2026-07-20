import { ImportNodeGeometryBlock } from "node-assets/Blocks/importNodeGeometryBlock";

import { ConfigureBlockForEditor, InputsCategory, InputsHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "import-node-geometry",
    label: "Node Geometry",
    category: InputsCategory,
    description: "Load a Node Geometry graph from a URL or Playground snippet.",
    keywords: ["import", "node geometry", "NGE", "procedural geometry", "snippet", "load"],
    headerColor: InputsHeaderColor,
    className: ImportNodeGeometryBlock.ClassName,
    create: (nodeAsset) => ConfigureBlockForEditor(new ImportNodeGeometryBlock("Node Geometry", nodeAsset)),
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
