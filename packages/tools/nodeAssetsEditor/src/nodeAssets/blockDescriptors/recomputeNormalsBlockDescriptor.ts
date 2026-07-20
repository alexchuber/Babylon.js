import { RecomputeNormalsBlock } from "node-assets/Blocks/recomputeNormalsBlock";

import { RegisterBlockDescriptor, UniversalAttributesCategory, UniversalAttributesHeaderColor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "recompute-normals",
    label: "Recompute Normals",
    description: "Recompute missing or existing vertex normals.",
    keywords: ["normals", "shading", "lighting", "mesh repair"],
    headerColor: UniversalAttributesHeaderColor,
    category: UniversalAttributesCategory,
    className: RecomputeNormalsBlock.ClassName,
    create: (nodeAsset) => new RecomputeNormalsBlock("Recompute Normals", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const recompute = block as RecomputeNormalsBlock;
        return {
            title: "RECOMPUTE NORMALS",
            properties: [
                {
                    kind: "switch",
                    label: "Overwrite existing",
                    value: recompute.overwriteExisting,
                    onChange: (value) => {
                        recompute.overwriteExisting = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
