import { RemoveDegenerateGeometryBlock } from "node-assets/Blocks/removeDegenerateGeometryBlock";

import { CleanupFamily, TransformHeaderColor, RegisterBlockDescriptor, UniversalCategory } from "../blockCatalog";

function IsValidTolerance(value: string): boolean {
    return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

RegisterBlockDescriptor({
    paletteItemId: "remove-degenerate-geometry",
    label: "Remove Degenerate Geometry",
    description: "Remove zero-area and near-zero-area triangles.",
    keywords: ["degenerate", "zero area", "triangles", "repair", "cleanup"],
    headerColor: TransformHeaderColor,
    category: UniversalCategory,
    family: CleanupFamily,
    className: RemoveDegenerateGeometryBlock.ClassName,
    create: (nodeAsset) => new RemoveDegenerateGeometryBlock("Remove Degenerate Geometry", nodeAsset),
    getPropertySection: (block, { refresh }) => {
        const removeDegenerate = block as RemoveDegenerateGeometryBlock;
        return {
            title: "REMOVE DEGENERATE GEOMETRY",
            properties: [
                {
                    kind: "text",
                    label: "Tolerance",
                    value: String(removeDegenerate.tolerance),
                    validator: IsValidTolerance,
                    validateOnlyOnBlur: true,
                    onChange: (value) => {
                        removeDegenerate.tolerance = Number(value);
                        refresh();
                    },
                },
            ],
        };
    },
});
