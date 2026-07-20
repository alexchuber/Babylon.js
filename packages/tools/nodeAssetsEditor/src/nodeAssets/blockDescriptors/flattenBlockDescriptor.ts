import { FlattenBlock } from "node-assets/Blocks/flattenBlock";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "flatten",
    label: "Flatten",
    description: "Bake scene transforms and simplify node hierarchy.",
    keywords: ["optimize", "cleanup", "bake transforms", "hierarchy"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
    className: FlattenBlock.ClassName,
    create: (nodeAsset) => new FlattenBlock("Flatten", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const flatten = block as FlattenBlock;
        return {
            title: "FLATTEN",
            properties: [
                {
                    kind: "switch",
                    label: "Cleanup empty nodes",
                    value: flatten.cleanup,
                    onChange: (value) => {
                        flatten.cleanup = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
