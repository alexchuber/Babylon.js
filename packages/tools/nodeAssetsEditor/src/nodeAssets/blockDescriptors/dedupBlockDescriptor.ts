import { DedupBlock } from "node-assets/Blocks/dedupBlock";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "dedup",
    label: "Dedup",
    description: "Reuse equivalent scene resources instead of storing duplicates.",
    keywords: ["optimize", "cleanup", "deduplicate", "reduce size"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
    className: DedupBlock.ClassName,
    create: (nodeAsset) => new DedupBlock("Dedup", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const dedup = block as DedupBlock;
        return {
            title: "DEDUP",
            properties: [
                {
                    kind: "switch",
                    label: "Keep unique names",
                    value: dedup.keepUniqueNames,
                    onChange: (value) => {
                        dedup.keepUniqueNames = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
