import { WeldBlock } from "node-assets/Blocks/weldBlock";

import { GltfCategory, GltfHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "weld",
    label: "Weld",
    description: "Merge equivalent vertices to reduce mesh duplication.",
    keywords: ["optimize", "cleanup", "vertices", "deduplicate", "topology"],
    headerColor: GltfHeaderColor,
    category: GltfCategory,
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
