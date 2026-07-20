import { MergeScenesBlock } from "node-assets/Blocks/mergeScenesBlock";

import { CompositionCategory, CompositionHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "merge-scenes-universal",
    label: "Merge Scenes",
    description: "Merge multiple Universal sources into one scene.",
    keywords: ["structure", "combine assets", "composition", "assemble", "multi source"],
    headerColor: CompositionHeaderColor,
    category: CompositionCategory,
    className: MergeScenesBlock.ClassName,
    create: (nodeAsset) => new MergeScenesBlock("Merge Scenes", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const merge = block as MergeScenesBlock;
        return {
            title: "MERGE SCENES",
            properties: [
                {
                    kind: "button",
                    label: "Add input",
                    onClick: () => {
                        merge.addInput();
                        refresh();
                    },
                },
            ],
        };
    },
});
