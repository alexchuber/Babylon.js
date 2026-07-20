import { SimplifyMeshesBlock } from "node-assets/Blocks/simplifyMeshesBlock";

import { OperatorCategory, OperatorHeaderColor, RegisterBlockDescriptor } from "../blockCatalog";

RegisterBlockDescriptor({
    paletteItemId: "simplify-meshes",
    label: "Simplify Meshes",
    description: "Reduce Universal mesh geometry to a target ratio and error limit.",
    keywords: ["decimate", "reduce polygons", "LOD", "optimize mesh"],
    headerColor: OperatorHeaderColor,
    category: OperatorCategory,
    className: SimplifyMeshesBlock.ClassName,
    create: (nodeAsset) => new SimplifyMeshesBlock("Simplify Meshes", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const simplify = block as SimplifyMeshesBlock;
        return {
            title: "SIMPLIFY MESHES",
            properties: [
                {
                    kind: "slider",
                    label: "Target ratio",
                    value: simplify.targetRatio,
                    min: 0,
                    max: 1,
                    step: 0.05,
                    onChange: (value) => {
                        simplify.targetRatio = value;
                        refresh();
                    },
                },
                {
                    kind: "slider",
                    label: "Error limit",
                    value: simplify.errorLimit,
                    min: 0,
                    max: 1,
                    step: 0.001,
                    onChange: (value) => {
                        simplify.errorLimit = value;
                        refresh();
                    },
                },
                {
                    kind: "switch",
                    label: "Lock border",
                    value: simplify.lockBorder,
                    onChange: (value) => {
                        simplify.lockBorder = value;
                        refresh();
                    },
                },
            ],
        };
    },
});
