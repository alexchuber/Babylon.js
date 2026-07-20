import { FlattenHierarchyBlock } from "node-assets/Blocks/flattenHierarchyBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "flatten-hierarchy",
    label: "Flatten Hierarchy",
    description: "Bake transforms and lift attachments to the root of the Universal scene.",
    keywords: ["structure", "hierarchy", "cleanup", "bake transforms"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: FlattenHierarchyBlock.ClassName,
    create: (nodeAsset) => new FlattenHierarchyBlock("Flatten Hierarchy", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const flatten = block as FlattenHierarchyBlock;
        return {
            title: "FLATTEN HIERARCHY",
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
