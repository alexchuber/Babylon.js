import { WeldVerticesBlock } from "node-assets/Blocks/weldVerticesBlock";

import { CleanupFamily, OperatorHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "weld-vertices",
    label: "Weld Vertices",
    description: "Merge equivalent vertices and index mesh primitives.",
    keywords: ["weld", "vertices", "deduplicate", "topology", "cleanup"],
    headerColor: OperatorHeaderColor,
    category: UniversalCategory,
    family: CleanupFamily,
    className: WeldVerticesBlock.ClassName,
    create: (nodeAsset) => new WeldVerticesBlock("Weld Vertices", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const weld = block as WeldVerticesBlock;
        return {
            title: "WELD VERTICES",
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
