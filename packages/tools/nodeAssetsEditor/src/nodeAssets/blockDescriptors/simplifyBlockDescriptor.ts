import { SimplifyBlock } from "node-assets/Blocks/simplifyBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "simplify",
    label: "Simplify",
    description: "Reduce mesh polygon count to a target ratio.",
    keywords: ["decimate", "reduce polygons", "LOD", "optimize mesh"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: SimplifyBlock.ClassName,
    create: (nodeAsset) => new SimplifyBlock("Simplify", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const simplify = block as SimplifyBlock;
        return {
            title: "SIMPLIFY",
            properties: [
                {
                    kind: "slider",
                    label: "Target ratio",
                    value: simplify.ratio,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    onChange: (value) => {
                        simplify.ratio = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Error limit",
                    value: simplify.error,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    onChange: (value) => {
                        simplify.error = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
