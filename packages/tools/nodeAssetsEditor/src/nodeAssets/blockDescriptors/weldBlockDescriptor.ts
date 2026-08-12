import { WeldBlock } from "node-assets/Blocks/weldBlock";

import { OperatorCategory, TransformHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "weld",
    label: "Weld",
    description: "Merge equivalent vertices to reduce mesh duplication.",
    keywords: ["optimize", "cleanup", "vertices", "deduplicate", "topology"],
    headerColor: TransformHeaderColor,
    category: OperatorCategory,
    isPaletteVisible: false,
    className: WeldBlock.ClassName,
    create: (nodeAsset) => new WeldBlock("Weld", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const weld = block as WeldBlock;
        return {
            title: "WELD",
            properties: [
                {
                    kind: "switch",
                    label: "Overwrite existing",
                    value: weld.overwrite,
                    onChange: (value) => {
                        weld.overwrite = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
