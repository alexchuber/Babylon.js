import { PruneBlock } from "node-assets/Blocks/pruneBlock";

import { OperatorCategory, TransformHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "prune",
    label: "Prune",
    description: "Remove unused scene resources from the output.",
    keywords: ["optimize", "cleanup", "remove unused", "dead assets"],
    headerColor: TransformHeaderColor,
    category: OperatorCategory,
    isPaletteVisible: false,
    className: PruneBlock.ClassName,
    create: (nodeAsset) => new PruneBlock("Prune", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const prune = block as PruneBlock;
        return {
            title: "PRUNE",
            properties: [
                {
                    kind: "switch",
                    label: "Keep leaf nodes",
                    value: prune.keepLeaves,
                    onChange: (value) => {
                        prune.keepLeaves = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Keep attributes",
                    value: prune.keepAttributes,
                    onChange: (value) => {
                        prune.keepAttributes = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
