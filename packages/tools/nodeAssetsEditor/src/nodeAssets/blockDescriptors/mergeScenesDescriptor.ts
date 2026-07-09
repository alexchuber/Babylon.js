import { MergeScenes } from "node-assets/Blocks/mergeScenes";

import { CompositionCategory, CompositionHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "merge-scenes",
    label: "Merge Scenes",
    headerColor: CompositionHeaderColor,
    category: CompositionCategory,
    className: MergeScenes.ClassName,
    create: (nodeAsset) => new MergeScenes("Merge Scenes", nodeAsset),
    getPropertySection: (block, refresh) => {
        const merge = block as MergeScenes;
        return {
            title: "MERGE SCENES",
            properties: [
                // Display-only readout of the current variadic input count.
                { kind: "text", label: "Inputs", value: String(merge.inputs.length), onChange: () => undefined },
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
