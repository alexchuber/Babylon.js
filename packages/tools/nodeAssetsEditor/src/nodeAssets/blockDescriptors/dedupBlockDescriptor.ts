import { DedupBlock } from "node-assets/Blocks/dedupBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "dedup",
    label: "Dedup",
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
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
