import { NormalsBlock } from "node-assets/Blocks/normalsBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "normals",
    label: "Normals",
    description: "Generate or replace vertex normals for scene meshes.",
    keywords: ["recalculate normals", "shading", "lighting", "mesh repair"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    isPaletteVisible: false,
    className: NormalsBlock.ClassName,
    create: (nodeAsset) => new NormalsBlock("Normals", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const normals = block as NormalsBlock;
        return {
            title: "NORMALS",
            properties: [
                {
                    kind: "switch",
                    label: "Overwrite existing",
                    value: normals.overwrite,
                    onChange: (value) => {
                        normals.overwrite = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
