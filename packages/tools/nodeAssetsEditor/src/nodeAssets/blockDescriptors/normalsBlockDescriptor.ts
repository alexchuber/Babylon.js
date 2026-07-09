import { NormalsBlock } from "node-assets/Blocks/normalsBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "normals",
    label: "Normals",
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
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
